import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NormalizedRecord, SourceConfig } from '../../packages/contracts/src/index.js';
import { normalizeLever } from '../../packages/core/src/index.js';
import { emptyCounters, JobRepository, migrate } from '../../packages/database/src/index.js';
import { testDatabase } from './helpers.js';

const source: SourceConfig = { provider: 'LEVER', region: 'global', site: 'fixture-persistence', employer: 'Fictional Persistence Co' };
const record = (id: string, text = 'Backend Engineer', observedAt = '2026-10-20T10:00:00.000Z'): NormalizedRecord => normalizeLever(
  { id, text, hostedUrl: `https://jobs.example.com/${id}`, categories: { location: 'Remote' } }, source,
  { requestUrl: 'fixture://persistence', observedAt, mappingVersion: 'lever-v1', mode: 'FIXTURE', page: 0 },
);

describe('PostgreSQL migrations and posting persistence', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let repository: JobRepository;
  let sourceId: string;
  let runId: string;
  let release: () => Promise<void>;
  beforeAll(async () => {
    db = await testDatabase();
    repository = new JobRepository(db.pool);
    sourceId = await repository.upsertSource(source, 'FIXTURE');
    release = await repository.acquireSource(sourceId);
    runId = await repository.startRun(sourceId);
  });
  afterAll(async () => { if (release) await release(); if (db) await db.close(); });

  it('migrates an empty schema and a second migration run is a no-op', async () => {
    expect(await migrate(db.pool, db.schema)).toBe(0);
    const tables = await db.pool.query<{ table_name: string }>('SELECT table_name FROM information_schema.tables WHERE table_schema=$1', [db.schema]);
    expect(tables.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining(['job_sources', 'ingestion_runs', 'opportunities', 'job_postings', 'job_snapshots', 'eligibility_assessments']));
  });

  it('reuses source identity but isolates fixture and live modes', async () => {
    expect(await repository.upsertSource(source, 'FIXTURE')).toBe(sourceId);
    expect(await repository.upsertSource(source, 'LIVE')).not.toBe(sourceId);
  });

  it('serializes simultaneous source runs', async () => {
    await expect(repository.acquireSource(sourceId)).rejects.toMatchObject({ code: 'SOURCE_BUSY' });
  });

  it('ingests concurrent identical records without duplicate postings, opportunities or snapshots', async () => {
    expect((await Promise.all([repository.persist(sourceId, runId, record('concurrent')), repository.persist(sourceId, runId, record('concurrent'))])).sort()).toEqual(['created', 'unchanged']);
    const result = await db.pool.query(`SELECT (SELECT count(*) FROM job_postings WHERE external_id='concurrent') AS postings,
      (SELECT count(*) FROM job_snapshots s JOIN job_postings p ON p.id=s.posting_id WHERE p.external_id='concurrent') AS snapshots,
      (SELECT count(*) FROM opportunities) AS opportunities`);
    expect(result.rows[0]).toEqual({ postings: '1', snapshots: '1', opportunities: '1' });
  });

  it('records A -> B -> A as three revisions with stable posting/opportunity identities', async () => {
    await repository.persist(sourceId, runId, record('history'));
    const before = await db.pool.query('SELECT id,opportunity_id FROM job_postings WHERE external_id=$1', ['history']);
    expect(await repository.persist(sourceId, runId, record('history', 'Senior Backend Engineer', '2026-10-21T10:00:00.000Z'))).toBe('updated');
    expect(await repository.persist(sourceId, runId, record('history', 'Backend Engineer', '2026-10-22T10:00:00.000Z'))).toBe('updated');
    const after = await db.pool.query('SELECT id,opportunity_id,first_seen_at,last_seen_at FROM job_postings WHERE external_id=$1', ['history']);
    expect(after.rows[0]).toMatchObject(before.rows[0]);
    expect(after.rows[0].first_seen_at.toISOString()).toBe('2026-10-20T10:00:00.000Z');
    expect(after.rows[0].last_seen_at.toISOString()).toBe('2026-10-22T10:00:00.000Z');
    const history = await db.pool.query('SELECT revision,raw,normalized FROM job_snapshots WHERE posting_id=$1 ORDER BY revision', [after.rows[0].id]);
    expect(history.rows.map((row) => row.normalized.title)).toEqual(['Backend Engineer', 'Senior Backend Engineer', 'Backend Engineer']);
    expect(history.rows.map((row) => row.revision)).toEqual([1, 2, 3]);
  });

  it('updates observation freshness without duplicating history and ignores JSON key ordering', async () => {
    await repository.persist(sourceId, runId, record('freshness'));
    const next = record('freshness', 'Backend Engineer', '2026-10-21T10:00:00.000Z');
    next.raw = Object.fromEntries(Object.entries(next.raw).reverse());
    expect(await repository.persist(sourceId, runId, next)).toBe('unchanged');
    const result = await db.pool.query(`SELECT p.last_seen_at,count(s.id) AS snapshots FROM job_postings p JOIN job_snapshots s ON s.posting_id=p.id WHERE p.external_id='freshness' GROUP BY p.id`);
    expect(result.rows[0].snapshots).toBe('1');
    expect(result.rows[0].last_seen_at.toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });

  it('rejects an old changed observation without corrupting the current posting', async () => {
    await expect(repository.persist(sourceId, runId, record('freshness', 'Old content', '2026-10-19T10:00:00.000Z'))).rejects.toMatchObject({ code: 'STALE_OBSERVATION' });
    const result = await db.pool.query("SELECT title FROM job_postings WHERE external_id='freshness'");
    expect(result.rows[0].title).toBe('Backend Engineer');
  });

  it('rolls back all posting/opportunity writes when an assessment violates a database constraint', async () => {
    const before = await db.pool.query('SELECT count(*) FROM opportunities');
    await expect(repository.persist(sourceId, runId, record('rollback'), {
      context: 'INDIA_REMOTE', result: 'BROKEN' as 'UNKNOWN', reasonCodes: [], evidence: [], classifierVersion: 'test', disclaimer: 'test',
    })).rejects.toThrow();
    expect((await db.pool.query("SELECT count(*) FROM job_postings WHERE external_id='rollback'")).rows[0].count).toBe('0');
    expect((await db.pool.query('SELECT count(*) FROM opportunities')).rows).toEqual(before.rows);
    expect(await repository.persist(sourceId, runId, record('after-rollback'))).toBe('created');
  });

  it('rejects records associated with another source run', async () => {
    const otherSource = await repository.upsertSource({ ...source, site: 'fixture-other' }, 'FIXTURE');
    await expect(repository.persist(otherSource, runId, record('wrong-source'))).rejects.toMatchObject({ code: 'RUN_SOURCE_MISMATCH' });
  });

  it('marks an abandoned run ABORTED when its source is resumed', async () => {
    const abandonedSource = await repository.upsertSource({ ...source, site: 'fixture-abandoned' }, 'FIXTURE');
    const lease = await repository.acquireSource(abandonedSource);
    try {
      const previous = await repository.startRun(abandonedSource);
      const next = await repository.startRun(abandonedSource);
      expect((await db.pool.query('SELECT status FROM ingestion_runs WHERE id=$1', [previous])).rows[0].status).toBe('ABORTED');
      await repository.finishRun(next, 'SUCCEEDED', true, emptyCounters(), []);
    } finally { await lease(); }
  });
});
