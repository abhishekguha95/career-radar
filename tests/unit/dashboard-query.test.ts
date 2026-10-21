import { describe, expect, it } from 'vitest';
import { jobsHref, parseFilters, sourceLabel } from '../../apps/web/src/lib/presentation.js';

describe('dashboard URL state', () => {
  it('labels provider demos using provider identity as well as site name', () => {
    expect(sourceLabel({ provider: 'LEVER', site: 'leverdemo', mode: 'LIVE' })).toBe('Provider demo');
    expect(sourceLabel({ provider: 'GREENHOUSE', site: 'leverdemo', mode: 'LIVE' })).toBe('Live source');
    expect(sourceLabel({ provider: 'GREENHOUSE', site: 'fixture-orbit', mode: 'FIXTURE' })).toBe('Sample data');
  });
  it('maps a relative observation window to the API without sending UI-only selection fields', () => {
    const result = parseFilters({ freshness: '7', title: 'Backend', job: '5cde694d-a1bf-4a08-8143-ea617fd34484' }, new Date('2026-10-21T12:00:00Z'));
    expect(result.query).toEqual({ page: 1, limit: 6, title: 'Backend', observedSince: '2026-10-14T12:00:00.000Z' });
    expect(result.selectedId).toBe('5cde694d-a1bf-4a08-8143-ea617fd34484');
  });
  it.each([{ page: '0' }, { mode: 'fake' }, { title: ['One', 'Two'] }, { job: '../private' }, { unknown: '1' }, { freshness: '999' }])('rejects malformed URL state %s', (params) => {
    expect(() => parseFilters(params)).toThrow();
  });
  it('preserves filters and encodes literal text while changing pagination/selection', () => {
    const { filters } = parseFilters({ title: 'Go & Node', mode: 'LIVE' });
    expect(jobsHref(filters, { page: 2, job: 'id' })).toBe('/?title=Go+%26+Node&mode=LIVE&page=2&job=id');
  });
});
