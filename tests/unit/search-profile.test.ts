import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SearchProfile } from '../../packages/contracts/src/index.js';
import { MAX_SEARCH_PROFILE_BYTES, readSearchProfile, validateSearchProfile } from '../../packages/core/src/search-profile.js';

describe('private search profile boundary', () => {
  let example: SearchProfile;
  let temporaryDirectory: string;
  const temporaryRoot = resolve(tmpdir());
  beforeAll(async () => {
    example = JSON.parse(await readFile('fixtures/profiles/example.json', 'utf8')) as SearchProfile;
    temporaryDirectory = await mkdtemp(join(temporaryRoot, 'career-radar-profile-'));
  });
  afterAll(async () => {
    if (temporaryDirectory && dirname(resolve(temporaryDirectory)) === temporaryRoot && basename(temporaryDirectory).startsWith('career-radar-profile-')) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('loads a fictional shared profile with separate tracks without network access', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      const result = await readSearchProfile('fixtures/profiles/example.json');
      expect(result.profile.candidate.skills).toEqual({ strongProduction: ['Python', 'PostgreSQL'], developing: ['Rust'], learningOrPortfolio: ['Kubernetes'] });
      expect(result.profile.tracks.indiaGlobalRemote.preferredCity).toBe('Kochi');
      expect(result.profile.tracks.europeRelocation.countryPriorityTiers).toEqual([['DK'], ['DE']]);
      expect(result.profile.candidate.unknowns.citizenship).toBeNull();
      expect(result.profile.candidate.unknowns.workAuthorizations).toEqual([]);
      expect(result.profile.scheduleIntent.localTime).toBeNull();
      expect(result.profileVersion).toMatch(/^search-profile-v1:sha256:[a-f0-9]{64}$/);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it('versions content consistently across object key order but preserves preference order', () => {
    const reversed = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(reversed);
      if (input !== null && typeof input === 'object') return Object.fromEntries(Object.entries(input).reverse().map(([key, value]) => [key, reversed(value)]));
      return input;
    };
    const original = validateSearchProfile(example);
    expect(validateSearchProfile(reversed(example)).profileVersion).toBe(original.profileVersion);
    const changed = structuredClone(example);
    changed.tracks.europeRelocation.countryPriorityTiers.reverse();
    expect(validateSearchProfile(changed).profileVersion).not.toBe(original.profileVersion);
  });

  it('changes version when a skill level changes, without manufacturing experience years', () => {
    const changed = structuredClone(example);
    changed.candidate.skills.developing = [];
    changed.candidate.skills.learningOrPortfolio.push('Rust');
    expect(validateSearchProfile(changed).profileVersion).not.toBe(validateSearchProfile(example).profileVersion);
    expect(validateSearchProfile(changed).profile.candidate.approximateYearsExperience).toBe(3);
  });

  const mutations: Array<[string, (profile: SearchProfile) => void]> = [
    ['conflicting skill groups', (profile) => { profile.candidate.skills.developing.push(' python '); }],
    ['duplicate location priorities', (profile) => { profile.tracks.indiaGlobalRemote.locationPreferenceOrder.fill('INDIA_REMOTE'); }],
    ['duplicate country tiers', (profile) => { profile.tracks.europeRelocation.countryPriorityTiers.push(['DK']); }],
    ['duplicate authorization claims', (profile) => { profile.candidate.unknowns.workAuthorizations = [{ countryCode: 'IN', status: 'UNKNOWN' }, { countryCode: 'IN', status: 'HELD' }]; }],
    ['review without timestamp', (profile) => { profile.review.status = 'REVIEWED'; }],
    ['timestamp without review', (profile) => { profile.review.reviewedAt = '2026-01-01T10:00:00Z'; }],
    ['invalid time zone', (profile) => { profile.scheduleIntent.timeZone = 'Invalid/Zone'; }],
    ['invalid local time', (profile) => { profile.scheduleIntent.localTime = '25:00'; }],
    ['reversed lookback range', (profile) => { profile.briefing.freshness.preferredLookbackDays = { minimum: 7, maximum: 3 }; }],
    ['excessive briefing quota', (profile) => { profile.briefing.maximumResultsPerTrack = 11; }],
  ];
  it.each(mutations)('rejects %s', (_name, mutate) => {
    const invalid = structuredClone(example); mutate(invalid);
    expect(() => validateSearchProfile(invalid)).toThrowError(expect.objectContaining({ code: 'PROFILE_INVALID' }));
  });

  it('rejects unknown fields, including per-track copies of shared candidate data', () => {
    expect(() => validateSearchProfile({ ...example, apiKey: 'fictional-sensitive-sentinel' })).toThrow();
    const invalid = { ...example, tracks: { ...example.tracks, indiaGlobalRemote: { ...example.tracks.indiaGlobalRemote, skills: ['Python'] } } };
    expect(() => validateSearchProfile(invalid)).toThrow();
  });

  it('preserves mutually exclusive geography and separate sponsorship/relocation policies', () => {
    const invalid = structuredClone(example) as unknown as Record<string, unknown>;
    invalid.tracks = { ...example.tracks, europeRelocation: { ...example.tracks.europeRelocation, excludeIndiaEmploymentAndRemoteFromIndia: false } };
    expect(() => validateSearchProfile(invalid)).toThrow();
    const { profile } = validateSearchProfile(example);
    expect(profile.tracks.indiaGlobalRemote.excludeEuropeanRelocation).toBe(true);
    expect(profile.tracks.europeRelocation.authorizationEvidence.assessSponsorshipAndRelocationSeparately).toBe(true);
    expect(profile.historyIntent.keepUnreportedCandidates).toBe(true);
    expect(profile.briefing.freshness.hardCutoff).toBe(false);
  });

  it('accepts an explicit reviewed timestamp without implicitly reviewing a draft', () => {
    const reviewed = structuredClone(example);
    reviewed.review = { status: 'REVIEWED', reviewedAt: '2026-01-01T10:00:00Z' };
    expect(validateSearchProfile(reviewed).profile.review.status).toBe('REVIEWED');
    expect(validateSearchProfile(example).profile.review.status).toBe('DRAFT');
  });

  it('bounds file reads and sanitizes all failures without exposing values or paths', async () => {
    const sentinel = 'fictional-sensitive-sentinel';
    const malformed = join(temporaryDirectory, 'malformed.json');
    const invalid = join(temporaryDirectory, 'invalid.json');
    const oversized = join(temporaryDirectory, 'oversized.json');
    await writeFile(malformed, '{"private":"' + sentinel, { flag: 'wx' });
    await writeFile(invalid, JSON.stringify({ ...example, candidate: sentinel }), { flag: 'wx' });
    await writeFile(oversized, Buffer.alloc(MAX_SEARCH_PROFILE_BYTES + 1), { flag: 'wx' });
    for (const [path, code] of [[malformed, 'PROFILE_INVALID_JSON'], [invalid, 'PROFILE_INVALID'], [oversized, 'PROFILE_TOO_LARGE'], [join(temporaryDirectory, 'missing.json'), 'PROFILE_READ_FAILED'], [temporaryDirectory, 'PROFILE_READ_FAILED']] as const) {
      try { await readSearchProfile(path); throw new Error('Expected validation failure'); }
      catch (error) {
        expect(error).toMatchObject({ code });
        expect(String(error)).not.toContain(sentinel);
        expect(String(error)).not.toContain(temporaryDirectory);
      }
    }
  });
});
