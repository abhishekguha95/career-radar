import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixtureAdapter, ingest, readFixture } from '../../packages/core/src/index.js';
import type { Fixture, PostingAdapter } from '../../packages/core/src/index.js';
import { JobRepository } from '../../packages/database/src/index.js';
import { testDatabase } from './helpers.js';

describe('end-to-end fixture ingestion', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let store: JobRepository;
  let baseline: Fixture;
  beforeAll(async () => { db = await testDatabase(); store = new JobRepository(db.pool); baseline = await readFixture('fixtures/lever/baseline.json'); });
  afterAll(async () => { if (db) await db.close(); });
  const replay = (fixture: Fixture, maxPages?: number) => ingest({ source: fixture.source, mode: 'FIXTURE', adapter: new FixtureAdapter(fixture), store, ...(maxPages ? { maxPages } : {}) });

  it('replays three postings twice with no duplicate history or opportunities', async () => {
    expect((await replay(baseline)).counters).toMatchObject({ fetched: 3, created: 3, accepted: 3 });
    expect(await replay(baseline)).toMatchObject({ status: 'SUCCEEDED', complete: true, counters: { created: 0, updated: 0, unchanged: 3 } });
    const counts = await db.pool.query('SELECT (SELECT count(*) FROM job_postings) AS postings,(SELECT count(*) FROM job_snapshots) AS snapshots,(SELECT count(*) FROM opportunities) AS opportunities');
    expect(counts.rows[0]).toEqual({ postings: '3', snapshots: '3', opportunities: '3' });
  });

  it('updates changed content but does not close absent postings after a successful smaller crawl', async () => {
    expect(await replay(await readFixture('fixtures/lever/changed.json'))).toMatchObject({ status: 'SUCCEEDED', counters: { updated: 1 } });
    expect((await db.pool.query('SELECT external_status FROM job_postings')).rows.every((row) => row.external_status === 'PUBLISHED')).toBe(true);
    expect((await db.pool.query('SELECT count(*) FROM job_snapshots')).rows[0].count).toBe('4');
  });

  it('retains successful changes after a later page fails and records PARTIAL with source health', async () => {
    const result = await replay(await readFixture('fixtures/lever/partial.json'));
    expect(result).toMatchObject({ status: 'PARTIAL', complete: false, counters: { accepted: 1, updated: 1 }, errors: [{ code: 'FIXTURE_PAGE_FAILURE', page: 1 }] });
    const row = (await db.pool.query('SELECT status,complete,counters FROM ingestion_runs WHERE id=$1', [result.runId])).rows[0];
    expect(row).toMatchObject({ status: 'PARTIAL', complete: false, counters: { accepted: 1 } });
    expect((await db.pool.query('SELECT health FROM job_sources WHERE id=$1', [result.sourceId])).rows[0].health).toBe('DEGRADED');
    expect((await db.pool.query("SELECT count(*) FROM job_postings WHERE external_status='PUBLISHED'")).rows[0].count).toBe('3');
  });

  it('does not close existing jobs after a total fetch failure', async () => {
    const result = await replay({ ...baseline, pages: [{ error: { code: 'SIMULATED_NETWORK_FAILURE', message: 'Offline' } }] });
    expect(result).toMatchObject({ status: 'FAILED', counters: { fetched: 0, accepted: 0 } });
    expect((await db.pool.query("SELECT count(*) FROM job_postings WHERE external_status='PUBLISHED'")).rows[0].count).toBe('3');
  });

  it('keeps a valid later duplicate when the first record with that ID is malformed', async () => {
    const fixture: Fixture = { ...baseline, source: { ...baseline.source, site: 'fixture-malformed' }, pages: [{ items: [
      { id: 'duplicate', text: null },
      { id: 'duplicate', text: 'Valid Engineer', hostedUrl: 'https://jobs.example.com/duplicate' },
      { id: 'neighbor', text: 'Neighbor Engineer', hostedUrl: 'https://jobs.example.com/neighbor' },
    ] }] };
    expect(await replay(fixture)).toMatchObject({ status: 'PARTIAL', complete: true, counters: { fetched: 3, rejected: 1, accepted: 2, created: 2 } });
  });

  it('marks a truncated crawl incomplete when the page cap is reached', async () => {
    const fixture = { ...baseline, source: { ...baseline.source, site: 'fixture-capped' } };
    expect(await replay(fixture, 1)).toMatchObject({ status: 'PARTIAL', complete: false, errors: [{ code: 'PAGE_LIMIT' }], counters: { created: 2 } });
  });

  it('bounds persisted error samples without losing rejected-record counts', async () => {
    const fixture: Fixture = { ...baseline, source: { ...baseline.source, site: 'fixture-many-errors' }, pages: [{ items: Array.from({ length: 70 }, () => ({ text: null })) }] };
    const result = await replay(fixture);
    expect(result).toMatchObject({ status: 'FAILED', errorCount: 70, counters: { rejected: 70 } });
    expect(result.errors).toHaveLength(50);
    expect(result.errors[49]?.code).toBe('ERRORS_TRUNCATED');
  });

  it('finalizes cancellation and releases its source lock', async () => {
    const source = { ...baseline.source, site: 'fixture-aborted' };
    const signal = AbortSignal.abort();
    const result = await ingest({ source, mode: 'FIXTURE', adapter: new FixtureAdapter({ ...baseline, source }), store, signal });
    expect(result).toMatchObject({ status: 'ABORTED', complete: false, counters: { fetched: 0 } });
    const release = await store.acquireSource(result.sourceId);
    await release();
  });

  it('prevents overlapping ingestion runs for the same source', async () => {
    const fixture = { ...baseline, source: { ...baseline.source, site: 'fixture-overlap' } };
    const adapter = new FixtureAdapter(fixture);
    let unblock!: () => void;
    let announce!: () => void;
    const started = new Promise<void>((resolve) => { announce = resolve; });
    const blocked = new Promise<void>((resolve) => { unblock = resolve; });
    const slowAdapter: PostingAdapter = { normalize: adapter.normalize, fetchPage: async (source, page) => { announce(); await blocked; return adapter.fetchPage(source, page); } };
    const first = ingest({ source: fixture.source, mode: 'FIXTURE', adapter: slowAdapter, store });
    await started;
    try { await expect(replay(fixture)).rejects.toMatchObject({ code: 'SOURCE_BUSY' }); }
    finally { unblock(); }
    expect((await first).status).toBe('SUCCEEDED');
  });
});
