import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Provenance, SourceConfig } from '../../packages/contracts/src/index.js';
import { FixtureAdapter, LeverAdapter, normalizeLever, readFixture } from '../../packages/core/src/index.js';

const source: SourceConfig = { provider: 'LEVER', region: 'global', site: 'fixture-northstar', employer: 'Fictional Employer' };
const provenance: Provenance = { requestUrl: 'fixture://lever/jobs', observedAt: '2026-10-20T00:00:00.000Z', mappingVersion: 'lever-v1', mode: 'FIXTURE', page: 0 };
const minimal = { id: '123', text: 'Backend Engineer', hostedUrl: 'https://jobs.example.com/123' };
const response = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers });

describe('Lever normalization', () => {
  it('retains absent attributes as unknown without using the title to guess remote status', () => {
    const normalized = normalizeLever({ ...minimal, text: 'Remote Engineer' }, source, provenance);
    expect(normalized.job).toMatchObject({ employer: 'Fictional Employer', workplace: 'UNKNOWN', country: null, location: null, description: null, employmentType: 'UNKNOWN', postedAt: null, sourceUpdatedAt: null, applyUrl: null });
    expect(normalized.raw).toEqual({ ...minimal, text: 'Remote Engineer' });
  });

  it('assembles body, lists and closing without dropping evidence or rendering scripts', () => {
    const normalized = normalizeLever({
      ...minimal, description: '<p>Build services.</p><script>run tools</script>',
      lists: [{ text: 'Location', content: '<li>Remote from India.</li>' }], additionalPlain: 'Closing.',
      workplaceType: 'hybrid', categories: { location: 'Pune', commitment: 'Full-time', allLocations: ['Pune', 'Stockholm'] },
    }, source, provenance);
    expect(normalized.job.description).toContain('Build services.');
    expect(normalized.job.description).toContain('Remote from India.');
    expect(normalized.job.description).toContain('Closing.');
    expect(normalized.job.description).not.toContain('run tools');
    expect(normalized.job).toMatchObject({ workplace: 'HYBRID', employmentType: 'FULL_TIME', country: null, allLocations: ['Pune', 'Stockholm'] });
  });

  it('uses epoch milliseconds consistently and preserves epoch zero', () => {
    expect(normalizeLever({ ...minimal, createdAt: 1714521600000, updatedAt: 0 }, source, provenance).job).toMatchObject({ postedAt: '2024-05-01T00:00:00.000Z', sourceUpdatedAt: '1970-01-01T00:00:00.000Z' });
  });

  it.each([
    null, { ...minimal, id: '' }, { ...minimal, text: null }, { ...minimal, hostedUrl: 'javascript:alert(1)' },
    { ...minimal, applyUrl: 'https://user:password@example.com' }, { ...minimal, createdAt: -1 },
    { ...minimal, categories: { allLocations: 'Pune' } },
  ])('rejects malformed posting without exposing its payload', (raw) => {
    expect(() => normalizeLever(raw, source, provenance)).toThrow('Posting does not satisfy');
  });

  it('preserves an unsupported workplace label as raw data and UNKNOWN', () => {
    expect(normalizeLever({ ...minimal, workplaceType: 'flexible' }, source, provenance).job).toMatchObject({ workplace: 'UNKNOWN', workplaceRaw: 'flexible' });
  });
});

describe('bounded Lever fetching', () => {
  it('uses fixed regional hosts, encoded pagination, and observed time', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response([minimal]));
    const adapter = new LeverAdapter({ fetch, sleep: async () => {}, pageSize: 1, now: () => new Date(provenance.observedAt) });
    const page = await adapter.fetchPage({ ...source, region: 'eu' }, 2);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://api.eu.lever.co/v0/postings/fixture-northstar?mode=json&skip=2&limit=1');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(page).toMatchObject({ hasMore: true, provenance: { observedAt: provenance.observedAt, mode: 'LIVE', page: 2 } });
  });

  it('rejects path injection before fetching', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(new LeverAdapter({ fetch }).fetchPage({ ...source, site: '../private' }, 0)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('respects Retry-After with bounded retry and jitter', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response({}, 429, { 'Retry-After': '2' })).mockResolvedValueOnce(response([]));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    await new LeverAdapter({ fetch, sleep, random: () => 0 }).fetchPage(source, 0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[250], [2000]]);
  });

  it('stops rather than retrying before a long Retry-After', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({}, 429, { 'Retry-After': '120' }));
    await expect(new LeverAdapter({ fetch, sleep: async () => {} }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])('does not retry terminal HTTP %s', async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({}, status));
    await expect(new LeverAdapter({ fetch, sleep: async () => {} }).fetchPage(source, 0)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caps transient failures at three requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response({}, 503));
    await expect(new LeverAdapter({ fetch, sleep: async () => {} }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'HTTP_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects malformed envelopes, invalid JSON, excessive pages and excessive response bytes', async () => {
    for (const [reply, code] of [[response({ jobs: [] }), 'MALFORMED_PAYLOAD'], [new Response('bad json'), 'INVALID_JSON'], [response([minimal, minimal]), 'MALFORMED_PAYLOAD'], [new Response('x'.repeat(100)), 'RESPONSE_TOO_LARGE']] as const) {
      await expect(new LeverAdapter({ fetch: async () => reply, sleep: async () => {}, pageSize: 1, maxResponseBytes: code === 'RESPONSE_TOO_LARGE' ? 90 : 1000 }).fetchPage(source, 0)).rejects.toMatchObject({ code });
    }
  });

  it('aborts slow requests and does not leave the timeout running', async () => {
    const fetch: typeof globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await expect(new LeverAdapter({ fetch, sleep: async () => {}, timeoutMs: 5, maxAttempts: 1 }).fetchPage(source, 0)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('offline fixtures', () => {
  it('replays multiple pages with stable observations and no global fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      const fixture = await readFixture('fixtures/lever/baseline.json');
      const adapter = new FixtureAdapter(fixture);
      const page0 = await adapter.fetchPage(fixture.source, 0);
      const page1 = await adapter.fetchPage(fixture.source, 1);
      expect(page0.items).toHaveLength(2);
      expect(page0.hasMore).toBe(true);
      expect(page1.hasMore).toBe(false);
      expect(adapter.normalize(page0.items[0], fixture.source, page0.provenance).job.title).toBe('Senior Backend Engineer');
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it('rejects fixture shape errors and reports deliberate partial-crawl failures', async () => {
    const fixture: unknown = JSON.parse(await readFile('fixtures/lever/baseline.json', 'utf8'));
    const adapter = new FixtureAdapter({ ...(fixture as object), pages: [{ items: [] }, { error: { code: 'FIXTURE_FAILURE', message: 'Deliberate later-page failure' } }] });
    await expect(adapter.fetchPage(adapter.fixture.source, 1)).rejects.toMatchObject({ code: 'FIXTURE_FAILURE' });
    expect(() => new FixtureAdapter({})).toThrow();
  });
});
