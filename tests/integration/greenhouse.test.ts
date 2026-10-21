import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../../apps/api/src/app.js';
import { jobDetailResponseSchema, jobsResponseSchema, sourcesResponseSchema } from '../../packages/contracts/src/index.js';
import { FixtureAdapter, GreenhouseAdapter, ingest, readFixture } from '../../packages/core/src/index.js';
import type { Fixture } from '../../packages/core/src/index.js';
import { JobRepository } from '../../packages/database/src/index.js';
import { testDatabase } from './helpers.js';

describe('Greenhouse persistence and read contracts', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let store: JobRepository;
  let fixture: Fixture;
  let app: Awaited<ReturnType<typeof createApi>>;
  let sourceId: string;
  const replay = (value: Fixture) => ingest({ source: value.source, mode: 'FIXTURE', adapter: new FixtureAdapter(value), store });
  beforeAll(async () => {
    db = await testDatabase(); store = new JobRepository(db.pool);
    fixture = await readFixture('fixtures/greenhouse/baseline.json');
    sourceId = (await replay(fixture)).sourceId;
    app = await createApi(db.pool);
  });
  afterAll(async () => { if (app) await app.close(); if (db) await db.close(); });

  it('repeats observations without duplicate postings or snapshots, including an undated role', async () => {
    expect(await replay(fixture)).toMatchObject({ status: 'SUCCEEDED', complete: true, counters: { created: 0, unchanged: 3 } });
    const counts = await db.pool.query('SELECT (SELECT count(*) FROM job_postings) AS postings,(SELECT count(*) FROM job_snapshots) AS snapshots');
    expect(counts.rows[0]).toEqual({ postings: '3', snapshots: '3' });
    const jobs = jobsResponseSchema.parse((await request(app.getHttpServer()).get(`/jobs?source=${sourceId}`).expect(200)).body);
    expect(jobs.data).toHaveLength(3);
    expect(jobs.data.find((job) => job.externalId === '103')?.postedAt).toBeNull();
    expect(jobs.data.every((job) => job.source.provider === 'GREENHOUSE' && job.workplace === 'UNKNOWN')).toBe(true);
  });

  it('keeps two job posting IDs distinct even when their internal job IDs match', async () => {
    const rows = await db.pool.query('SELECT external_id,opportunity_id FROM job_postings WHERE external_id IN ($1,$2)', ['101', '102']);
    expect(rows.rows).toHaveLength(2);
    expect(new Set(rows.rows.map((row) => row.opportunity_id)).size).toBe(2);
  });

  it('preserves source evidence and does not interpret relocation as India eligibility', async () => {
    const summaries = jobsResponseSchema.parse((await request(app.getHttpServer()).get(`/jobs?source=${sourceId}`).expect(200)).body);
    const summary = summaries.data.find((job) => job.externalId === '102')!;
    const { data } = jobDetailResponseSchema.parse((await request(app.getHttpServer()).get(`/jobs/${summary.id}`).expect(200)).body);
    expect(data.description).toContain('Relocation assistance may be available.');
    expect(data.description).not.toContain('<p>');
    expect(data.eligibility?.result).toBe('UNKNOWN');
    expect(data.provenance.currentSnapshot).toMatchObject({ mappingVersion: 'greenhouse-v1', raw: { id: 102, internal_job_id: 900 } });
    const sources = sourcesResponseSchema.parse((await request(app.getHttpServer()).get('/sources').expect(200)).body);
    expect(sources.data.find((source) => source.id === sourceId)).toMatchObject({ provider: 'GREENHOUSE', jobCount: 3, remoteCount: 0, latestRun: { status: 'SUCCEEDED' } });
    expect((await request(app.getHttpServer()).get('/jobs?location=Helsinki').expect(200)).body.pagination.total).toBe(1);
  });

  it('appends changed content to history while retaining the posting ID', async () => {
    const before = (await db.pool.query('SELECT id FROM job_postings WHERE source_id=$1 AND external_id=$2', [sourceId, '101'])).rows[0];
    const changed = structuredClone(fixture);
    changed.observedAt = '2026-10-23T04:00:00.000Z';
    const item = changed.pages[0];
    if (!item || !('items' in item)) throw new Error('Missing fixture records');
    item.items = [{ ...(item.items[0] as Record<string, unknown>), title: 'Senior Backend Engineer - Payments' }];
    expect(await replay(changed)).toMatchObject({ status: 'SUCCEEDED', counters: { updated: 1 } });
    const { data } = jobDetailResponseSchema.parse((await request(app.getHttpServer()).get(`/jobs/${before.id}`).expect(200)).body);
    expect(data.id).toBe(before.id);
    expect(data.provenance.history).toMatchObject({ total: 2 });
    expect((await db.pool.query("SELECT count(*) FROM job_postings WHERE source_id=$1 AND external_status='PUBLISHED'", [sourceId])).rows[0].count).toBe('3');
  });

  it('isolates the same site/posting IDs across providers and collection modes', async () => {
    const lever: Fixture = { source: { ...fixture.source, provider: 'LEVER' }, observedAt: fixture.observedAt,
      pages: [{ items: [{ id: '101', text: 'Different Lever Posting', hostedUrl: 'https://jobs.example.com/lever/101' }] }] };
    const leverResult = await replay(lever);
    expect(leverResult.sourceId).not.toBe(sourceId);
    expect(await store.upsertSource(fixture.source, 'LIVE')).not.toBe(sourceId);
    const rows = await db.pool.query('SELECT id FROM job_postings WHERE external_id=$1', ['101']);
    expect(rows.rows).toHaveLength(2);
    const policy = await db.pool.query('SELECT policy FROM job_sources WHERE id=$1', [sourceId]);
    expect(policy.rows[0].policy.documentationUrl).toBe('https://docs.greenhouse.io/job-board.html');
  });

  it('enforces provider and region constraints in PostgreSQL as well as runtime validation', async () => {
    await expect(db.pool.query("UPDATE job_sources SET region='eu' WHERE id=$1", [sourceId])).rejects.toMatchObject({ code: '23514' });
    await expect(db.pool.query("UPDATE job_sources SET provider='ASHBY' WHERE id=$1", [sourceId])).rejects.toMatchObject({ code: '23514' });
  });

  it('retains valid records when a declared board total is incomplete and never closes missing jobs', async () => {
    const source = { ...fixture.source, site: 'fixture-partial-greenhouse' };
    let payload: unknown = { jobs: [{ id: 1, title: 'Backend Engineer', absolute_url: 'https://jobs.example.com/one' },
      { id: 2, title: 'Platform Engineer', absolute_url: 'https://jobs.example.com/two' }], meta: { total: 2 } };
    const adapter = new GreenhouseAdapter({ fetch: async () => new Response(JSON.stringify(payload)), sleep: async () => {} });
    expect((await ingest({ source, mode: 'LIVE', adapter, store })).status).toBe('SUCCEEDED');
    payload = { jobs: [{ id: 1, title: 'Backend Engineer', absolute_url: 'https://jobs.example.com/one' }], meta: { total: 2 } };
    const result = await ingest({ source, mode: 'LIVE', adapter, store });
    expect(result).toMatchObject({ status: 'PARTIAL', complete: false, counters: { unchanged: 1 }, errors: [{ code: 'INCOMPLETE_ENUMERATION' }] });
    expect((await db.pool.query('SELECT external_status FROM job_postings WHERE source_id=$1', [result.sourceId])).rows.map((row) => row.external_status)).toEqual(['PUBLISHED', 'PUBLISHED']);
    payload = {};
    expect((await ingest({ source, mode: 'LIVE', adapter, store })).status).toBe('FAILED');
    expect((await db.pool.query("SELECT count(*) FROM job_postings WHERE source_id=$1 AND external_status='PUBLISHED'", [result.sourceId])).rows[0].count).toBe('2');
  });

  it('isolates malformed records while preserving valid neighbors and accurate counts', async () => {
    const source = { ...fixture.source, site: 'fixture-malformed-greenhouse' };
    const adapter = new GreenhouseAdapter({ fetch: async () => new Response(JSON.stringify({ jobs: [
      { id: 1, title: null }, { id: 2, title: 'Backend Engineer', absolute_url: 'https://jobs.example.com/two' },
    ], meta: { total: 2 } })), sleep: async () => {} });
    expect(await ingest({ source, mode: 'LIVE', adapter, store })).toMatchObject({ status: 'PARTIAL', complete: true, counters: { fetched: 2, rejected: 1, accepted: 1, created: 1 } });
  });
});
