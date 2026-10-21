import { describe, expect, it } from 'vitest';
import { assessIndiaRemote, normalizeLever } from '../../packages/core/src/index.js';

function record(description?: string, workplaceType = 'remote') {
  return normalizeLever({
    id: 'eligibility', text: 'Backend Engineer', descriptionPlain: description,
    workplaceType, hostedUrl: 'https://jobs.example.com/eligibility', categories: { location: 'Remote - India' },
  }, { provider: 'LEVER', region: 'global', site: 'fixture-eligibility', employer: 'Fictional Co' }, {
    mode: 'FIXTURE', page: 0, requestUrl: 'fixture://eligibility', mappingVersion: 'lever-v1', observedAt: '2026-10-20T00:00:00.000Z',
  });
}

describe('narrow India-remote geography signal', () => {
  it.each([
    undefined, 'Remote work is available.', 'Remote worldwide.', 'We hire in EMEA and APAC.',
    'Relocation support and visa assistance are available.',
    'This role cannot be performed remotely from India.',
    'Do not assume this role may be performed remotely from India.',
    'This role may be performed remotely from India if you already have US work authorization.',
    'This role may be performed remotely from India?',
    'Example: This role may be performed remotely from India.',
  ])('leaves ambiguous/unsupported wording UNKNOWN: %s', (text) => {
    const signal = assessIndiaRemote(record(text));
    expect(signal.result).toBe('UNKNOWN');
    expect(signal.disclaimer).toContain('require verification');
  });

  it.each([
    'This role may be performed remotely from India.',
    'This role can be performed remotely from India.',
    'This role is open to remote applicants residing in India.',
    'We can hire remotely in India for this role.',
  ])('recognizes explicit source permission: %s', (text) => {
    expect(assessIndiaRemote(record(text))).toMatchObject({ result: 'ELIGIBLE', context: 'INDIA_REMOTE', classifierVersion: 'india-remote-v1', reasonCodes: ['EXPLICIT_INDIA_REMOTE_PERMISSION'] });
  });

  it.each([
    'Applicants must currently reside in the United States.',
    'Applicants must currently reside in Sweden.',
    'This role is open only to applicants residing in Canada.',
    'Applicants residing in India are not eligible for this role.',
    'Remote work from India is not permitted for this role.',
  ])('recognizes explicit residence exclusion: %s', (text) => {
    expect(assessIndiaRemote(record(text)).result).toBe('INELIGIBLE');
  });

  it('keeps precise source offsets and observation evidence', () => {
    const input = record('Build services.  This role may be performed remotely from India.');
    const signal = assessIndiaRemote(input);
    const evidence = signal.evidence[0]!;
    expect(input.job.description!.slice(evidence.start, evidence.end)).toBe(evidence.text);
    expect(evidence).toMatchObject({ sourceUrl: input.job.canonicalUrl, observedAt: input.provenance.observedAt, field: 'description' });
  });

  it('recognizes explicit permission in converted HTML lists and preserves offsets', () => {
    const input = record('Work location\n * This role may be performed remotely from India.');
    const signal = assessIndiaRemote(input);
    expect(signal.result).toBe('ELIGIBLE');
    const evidence = signal.evidence[0]!;
    expect(input.job.description!.slice(evidence.start, evidence.end)).toBe(evidence.text);
  });

  it('does not turn contradictory evidence into a confirmed signal', () => {
    expect(assessIndiaRemote(record('This role may be performed remotely from India. Applicants must currently reside in the United States.'))).toMatchObject({ result: 'UNKNOWN', reasonCodes: ['CONFLICTING_GEOGRAPHY_EVIDENCE'] });
  });

  it.each(['on-site', 'hybrid'])('flags contradiction with structured %s metadata', (workplace) => {
    expect(assessIndiaRemote(record('This role may be performed remotely from India.', workplace))).toMatchObject({ result: 'UNKNOWN', reasonCodes: ['CONFLICTING_WORKPLACE_METADATA'] });
  });

  it.each([
    'This role may be performed remotely from India. However, hiring depends on local approval.',
    'The following is a hypothetical example. This role may be performed remotely from India.',
    'This is not a requirement. Applicants must currently reside in the United States.',
  ])('requires review when qualifying context exists: %s', (text) => {
    expect(assessIndiaRemote(record(text))).toMatchObject({ result: 'UNKNOWN', reasonCodes: ['CONTEXT_REQUIRES_REVIEW'] });
  });
});
