import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../../apps/api/src/app.js';
import { FixtureAdapter, ingest, readFixture } from '../../packages/core/src/index.js';
import { JobRepository } from '../../packages/database/src/index.js';
import { testDatabase } from './helpers.js';

describe('read-only HTTP API backed by PostgreSQL', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: Awaited<ReturnType<typeof createApi>>;
  let sourceId: string;
  beforeAll(async () => {
    db = await testDatabase();
    const fixture = await readFixture('fixtures/lever/baseline.json');
    const result = await ingest({ source: fixture.source, mode: 'FIXTURE', adapter: new FixtureAdapter(fixture), store: new JobRepository(db.pool) });
    sourceId = result.sourceId;
    app = await createApi(db.pool);
  });
  afterAll(async () => { if (app) await app.close(); if (db) await db.close(); });

  it('separates liveness from migration-aware readiness', async () => {
    expect((await request(app.getHttpServer()).get('/health').expect(200)).body).toEqual({ status: 'ok', service: 'career-radar', phase: 1 });
    expect((await request(app.getHttpServer()).get('/ready').expect(200)).body).toEqual({ status: 'ready', database: 'ok' });
    const query = db.pool.query.bind(db.pool);
    try {
      await db.pool.query(`ALTER TABLE job_postings RENAME COLUMN last_provenance TO hidden_provenance`);
      await request(app.getHttpServer()).get('/health').expect(200);
      const response = await request(app.getHttpServer()).get('/ready').expect(503);
      expect(response.body.error.code).toBe('DATABASE_NOT_READY');
      expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
      const unavailable = await request(app.getHttpServer()).get('/jobs').expect(500);
      expect(unavailable.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(unavailable.body)).not.toContain('hidden_provenance');
    } finally { await query('ALTER TABLE job_postings RENAME COLUMN hidden_provenance TO last_provenance'); }
  });

  it('paginates deterministically without overlapping records in a stable dataset', async () => {
    const first = (await request(app.getHttpServer()).get('/jobs?limit=2&page=1').expect(200)).body;
    const second = (await request(app.getHttpServer()).get('/jobs?limit=2&page=2').expect(200)).body;
    expect(first.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2, hasNext: true });
    expect(second.pagination).toMatchObject({ page: 2, total: 3, hasNext: false });
    expect(new Set([...first.data, ...second.data].map((job: { id: string }) => job.id)).size).toBe(3);
    expect(first.data[0]).not.toHaveProperty('description');
    expect(first.data[0]).not.toHaveProperty('raw');
    expect(first.data[0]).toMatchObject({ source: { provider: 'LEVER', mode: 'FIXTURE', health: 'HEALTHY' }, latestRun: { status: 'SUCCEEDED', complete: true } });
  });

  it.each([
    ['title=Senior', 1], ['location=India', 1], ['workplace=REMOTE', 3], ['workplace=HYBRID', 0],
    ['mode=LIVE', 0], ['observedSince=2026-10-21T00%3A00%3A00Z', 0], ['title=%25', 0], ["title=%27%20OR%201%3D1%20--", 0],
  ])('filters %s', async (query, total) => {
    expect((await request(app.getHttpServer()).get(`/jobs?${query}`).expect(200)).body.pagination.total).toBe(total);
  });

  it('filters by exact source identity', async () => {
    expect((await request(app.getHttpServer()).get(`/jobs?source=${sourceId}`).expect(200)).body.pagination.total).toBe(3);
    expect((await request(app.getHttpServer()).get(`/jobs?source=${randomUUID()}`).expect(200)).body.pagination.total).toBe(0);
  });

  it.each(['limit=101', 'page=0', 'page=1&page=2', 'workplace=remote', 'source=lever', 'observedSince=yesterday', 'unexpected=value'])('rejects invalid query %s predictably', async (query) => {
    const response = await request(app.getHttpServer()).get(`/jobs?${query}`).expect(400);
    expect(response.body.error).toMatchObject({ code: 'INVALID_QUERY', message: 'Query parameters failed validation' });
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.error.details).toBeInstanceOf(Array);
  });

  it('returns detail, preserved raw provenance, source metadata and cited geography evidence', async () => {
    const summary = (await request(app.getHttpServer()).get('/jobs?title=Senior').expect(200)).body.data[0];
    const response = await request(app.getHttpServer()).get(`/jobs/${summary.id}`).expect(200);
    const job = response.body.data;
    expect(job).toMatchObject({ externalId: 'backend-001', source: { mode: 'FIXTURE' }, eligibility: { context: 'INDIA_REMOTE', result: 'ELIGIBLE', classifierVersion: 'india-remote-v1' } });
    expect(job.provenance.currentSnapshot.raw.id).toBe('backend-001');
    expect(job.provenance.currentSnapshot.mappingVersion).toBe('lever-v1');
    expect(job.provenance.latestObservation.observedAt).toBe('2026-10-20T10:00:00.000Z');
    expect(job.provenance.history).toMatchObject({ total: 1, hasMore: false });
    const evidence = job.eligibility.evidence[0];
    expect(job.description.slice(evidence.start, evidence.end)).toBe(evidence.text);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('exposes vague remote wording as UNKNOWN with a limited-scope disclaimer', async () => {
    const job = (await request(app.getHttpServer()).get('/jobs?title=Backend%20Platform').expect(200)).body.data[0];
    expect(job.eligibility).toMatchObject({ result: 'UNKNOWN', reasonCodes: ['NO_EXPLICIT_INDIA_REMOTE_EVIDENCE'] });
    expect(job.eligibility.disclaimer).toContain('overall application eligibility require verification');
  });

  it('returns predictable errors for malformed/missing IDs and endpoints', async () => {
    expect((await request(app.getHttpServer()).get('/jobs/bad-id').expect(400)).body.error.code).toBe('INVALID_JOB_ID');
    expect((await request(app.getHttpServer()).get(`/jobs/${randomUUID()}`).expect(404)).body.error.code).toBe('JOB_NOT_FOUND');
    expect((await request(app.getHttpServer()).get('/missing').expect(404)).body.error.code).toBe('NOT_FOUND');
    await request(app.getHttpServer()).post('/jobs').send({ title: 'No writes' }).expect(404);
  });

  it('exposes changed posting history without creating another opportunity', async () => {
    const fixture = await readFixture('fixtures/lever/changed.json');
    await ingest({ source: fixture.source, mode: 'FIXTURE', adapter: new FixtureAdapter(fixture), store: new JobRepository(db.pool) });
    const summary = (await request(app.getHttpServer()).get('/jobs?title=Senior').expect(200)).body.data[0];
    const job = (await request(app.getHttpServer()).get(`/jobs/${summary.id}`).expect(200)).body.data;
    expect(job.provenance.history.total).toBe(2);
    expect(job.provenance.history.data.map((snapshot: { title: string }) => snapshot.title)).toEqual(['Senior Backend Engineer - Platform', 'Senior Backend Engineer']);
  });

  it('combines filters and searches additional locations', async () => {
    const fixture = await readFixture('fixtures/lever/baseline.json');
    fixture.source = { ...fixture.source, site: 'fixture-secondary-location' };
    fixture.pages = [{ items: [{ id: 'multi-location', text: 'Multi Location Engineer', hostedUrl: 'https://jobs.example.com/multi', workplaceType: 'hybrid', categories: { location: 'Stockholm', allLocations: ['Stockholm', 'Pune'] } }] }];
    await ingest({ source: fixture.source, mode: 'FIXTURE', adapter: new FixtureAdapter(fixture), store: new JobRepository(db.pool) });
    const result = await request(app.getHttpServer()).get('/jobs?location=Pune&workplace=HYBRID&title=Multi&mode=FIXTURE').expect(200);
    expect(result.body.pagination.total).toBe(1);
    expect(result.body.data[0].location).toBe('Stockholm');
  });
});
