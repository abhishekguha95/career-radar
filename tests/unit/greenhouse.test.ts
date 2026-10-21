import { describe, expect, it, vi } from 'vitest';
import type { Provenance, SourceConfig } from '../../packages/contracts/src/index.js';
import { sourceConfigSchema, sourceStatusSchema } from '../../packages/contracts/src/index.js';
import { FixtureAdapter, GreenhouseAdapter, LeverAdapter, normalizeGreenhouse, readFixture } from '../../packages/core/src/index.js';

const source: SourceConfig = { provider: 'GREENHOUSE', region: 'global', site: 'fixture-orbit', employer: 'Fictional Employer' };
const provenance: Provenance = { requestUrl: 'fixture://greenhouse/fixture-orbit', observedAt: '2026-10-22T04:00:00.000Z', mappingVersion: 'greenhouse-v1', mode: 'FIXTURE', page: 0 };
const minimal = { id: 123, title: 'Backend Engineer', absolute_url: 'https://jobs.example.com/123' };
const envelope = (jobs: unknown[] = [], total = jobs.length) => ({ jobs, meta: { total } });
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe('Greenhouse normalization and provider contracts', () => {
  it('uses posting identity and keeps absent attributes unknown', () => {
    const record = normalizeGreenhouse({ ...minimal, internal_job_id: 456, title: 'Remote Engineer' }, source, provenance);
    expect(record.job).toMatchObject({ externalId: '123', employer: 'Fictional Employer', country: null, workplace: 'UNKNOWN', workplaceRaw: null, employmentType: 'UNKNOWN', description: null, location: null, postedAt: null, sourceUpdatedAt: null, applyUrl: minimal.absolute_url });
    expect(record.raw.internal_job_id).toBe(456);
  });

  it.each([
    '<p>Build services.</p><script>run tools</script><p>Work remotely from India.</p>',
    '&lt;p&gt;Build services.&lt;/p&gt;&lt;script&gt;run tools&lt;/script&gt;&lt;p&gt;Work remotely from India.&lt;/p&gt;',
  ])('preserves source passages as plain text from direct or entity-escaped HTML', (content) => {
    const record = normalizeGreenhouse({ ...minimal, content }, source, provenance);
    expect(record.job.description).toContain('Build services.');
    expect(record.job.description).toContain('Work remotely from India.');
    expect(record.job.description).not.toMatch(/run tools|<p>|<script>/);
    expect(record.raw.content).toBe(content);
  });

  it('preserves published and updated timestamps independently and collects stated office locations', () => {
    const record = normalizeGreenhouse({ ...minimal, first_published: '2026-10-20T10:00:00+05:30', updated_at: '2026-10-21T10:00:00Z',
      location: { name: 'Stockholm' }, offices: [{ location: 'Helsinki' }, { location: 'Stockholm' }, { location: null }] }, source, provenance);
    expect(record.job).toMatchObject({ postedAt: '2026-10-20T04:30:00.000Z', sourceUpdatedAt: '2026-10-21T10:00:00.000Z', allLocations: ['Stockholm', 'Helsinki'], country: null });
  });

  it.each([null, { ...minimal, id: Number.MAX_SAFE_INTEGER + 1 }, { ...minimal, id: 0 }, { ...minimal, id: '123' },
    { ...minimal, title: null }, { ...minimal, content: {} }, { ...minimal, first_published: 'yesterday' },
    { ...minimal, absolute_url: 'javascript:alert(1)' }, { ...minimal, absolute_url: 'https://user:secret@example.com' },
  ])('rejects malformed records without exposing the payload', (raw) => {
    expect(() => normalizeGreenhouse(raw, source, provenance)).toThrow('Posting does not satisfy the Greenhouse mapping contract');
  });

  it('rejects unsupported provider/region combinations in input and output contracts', () => {
    expect(sourceConfigSchema.safeParse({ ...source, provider: 'ASHBY' }).success).toBe(false);
    expect(sourceConfigSchema.safeParse({ ...source, region: 'eu' }).success).toBe(false);
    expect(sourceConfigSchema.safeParse({ ...source, provider: 'LEVER', region: 'eu' }).success).toBe(true);
    expect(sourceStatusSchema.safeParse({ ...source, region: 'eu', id: '0d7b4d1e-d1db-4e88-bba2-c6a1a397b62e', mode: 'LIVE', health: 'UNKNOWN', lastSuccessfulRunAt: null, jobCount: 0, remoteCount: 0, latestRun: null }).success).toBe(false);
  });

  it('replays fictional Greenhouse records without network requests', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      const fixture = await readFixture('fixtures/greenhouse/baseline.json');
      const adapter = new FixtureAdapter(fixture);
      const page = await adapter.fetchPage(fixture.source, 0);
      expect(page).toMatchObject({ hasMore: false, provenance: { mode: 'FIXTURE', mappingVersion: 'greenhouse-v1', requestUrl: 'fixture://greenhouse/global/fixture-orbit?page=0' } });
      expect(adapter.normalize(page.items[0], fixture.source, page.provenance).job.externalId).toBe('101');
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});

describe('bounded Greenhouse fetching', () => {
  it('fetches the documented fixed-host full-board envelope once with provenance', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(envelope([minimal])));
    const adapter = new GreenhouseAdapter({ fetch, sleep: async () => {}, now: () => new Date(provenance.observedAt) });
    const page = await adapter.fetchPage(source, 0);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://boards-api.greenhouse.io/v1/boards/fixture-orbit/jobs?content=true');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(page).toMatchObject({ items: [minimal], hasMore: false, provenance: { mappingVersion: 'greenhouse-v1', observedAt: provenance.observedAt, mode: 'LIVE' } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([[[], 0, false], [[minimal], 2, true], [[minimal], 0, true], [[minimal, minimal], 2, true]] as const)('reconciles totals and detects duplicate posting IDs', async (jobs, total, hasMore) => {
    const adapter = new GreenhouseAdapter({ fetch: async () => response(envelope([...jobs], total)), sleep: async () => {} });
    expect((await adapter.fetchPage(source, 0)).hasMore).toBe(hasMore);
  });

  it('does not repeatedly fetch the same envelope as additional pages', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(new GreenhouseAdapter({ fetch }).fetchPage(source, 1)).rejects.toMatchObject({ code: 'INCOMPLETE_ENUMERATION' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects path injection and mismatched provider before any request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const adapter = new GreenhouseAdapter({ fetch });
    await expect(adapter.fetchPage({ ...source, site: '../private' }, 0)).rejects.toThrow();
    await expect(adapter.fetchPage({ ...source, provider: 'LEVER' }, 0)).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    await expect(new LeverAdapter({ fetch }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{}, [], { jobs: [], meta: {} }, { jobs: [], meta: { total: -1 } }, { jobs: {}, meta: { total: 0 } }])('rejects malformed envelopes', async (payload) => {
    await expect(new GreenhouseAdapter({ fetch: async () => response(payload), sleep: async () => {} }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'MALFORMED_PAYLOAD' });
  });

  it('retries rate limits with Retry-After and preserves pacing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response({}, 429, { 'Retry-After': '2' })).mockResolvedValueOnce(response(envelope()));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    await new GreenhouseAdapter({ fetch, sleep, random: () => 0 }).fetchPage(source, 0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[250], [2000]]);
  });

  it.each([401, 403, 404, 429])('does not retry terminal access failures or long Retry-After (%s)', async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({}, status, { 'Retry-After': '120' }));
    await expect(new GreenhouseAdapter({ fetch, sleep: async () => {} }).fetchPage(source, 0)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds transient retries, response bytes and JSON parsing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response({}, 503));
    await expect(new GreenhouseAdapter({ fetch, sleep: async () => {} }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'HTTP_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(new GreenhouseAdapter({ fetch: async () => new Response('x'.repeat(100)), sleep: async () => {}, maxResponseBytes: 90 }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    await expect(new GreenhouseAdapter({ fetch: async () => new Response('bad json'), sleep: async () => {} }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('honors timeouts and caller cancellation', async () => {
    const fetch: typeof globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await expect(new GreenhouseAdapter({ fetch, sleep: async () => {}, timeoutMs: 5, maxAttempts: 1 }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'TIMEOUT' });
    const cancelled = vi.fn<typeof globalThis.fetch>();
    await expect(new GreenhouseAdapter({ fetch: cancelled, signal: AbortSignal.abort() }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'ABORTED' });
    expect(cancelled).not.toHaveBeenCalled();
  });
});
