import type { EligibilityEvidence, EligibilitySignal, NormalizedRecord } from '@career-radar/contracts';

export const INDIA_REMOTE_CLASSIFIER_VERSION = 'india-remote-v1';
const DISCLAIMER = 'Source-reported residence/remote-work signal only. Work authorization, sponsorship, and overall application eligibility require verification.';

// Deliberately recognize a few complete statements rather than combine keywords.
const permissionRules = [
  /^This role (?:may|can) be performed remotely from India[.!]?$/i,
  /^This role is open to remote applicants residing in India[.!]?$/i,
  /^We can hire remotely in India for this role[.!]?$/i,
];
const excludedCountry = '(?:the United States|the United Kingdom|Canada|Germany|Sweden|Finland|Denmark|Norway|the Netherlands)';
const exclusionRules = [
  new RegExp(`^Applicants must currently reside in ${excludedCountry}[.!]?$`, 'i'),
  new RegExp(`^This role is open only to applicants residing in ${excludedCountry}[.!]?$`, 'i'),
  /^Applicants residing in India are not eligible for this role[.!]?$/i,
  /^Remote work from India is not permitted for this role[.!]?$/i,
];
const reviewCues = /\b(?:however|unless|except|subject to|provided that|hypothetical|example|quoted|quotation|not a requirement|not applicable|does not apply)\b/i;

export function assessIndiaRemote(record: NormalizedRecord): EligibilitySignal {
  const text = record.job.description ?? '';
  const permissions: EligibilityEvidence[] = [];
  const exclusions: EligibilityEvidence[] = [];
  for (const match of text.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const passage = match[0].trim().replace(/^[*•-]\s+/, '').trimStart();
    if (!passage || passage.endsWith('?')) continue;
    const normalized = passage.replace(/\s+/g, ' ');
    const start = match.index + match[0].indexOf(passage);
    const evidence: EligibilityEvidence = {
      text: passage, field: 'description', start, end: start + passage.length,
      sourceUrl: record.job.canonicalUrl, observedAt: record.provenance.observedAt,
    };
    if (permissionRules.some((rule) => rule.test(normalized))) permissions.push(evidence);
    if (exclusionRules.some((rule) => rule.test(normalized))) exclusions.push(evidence);
  }
  const evidence = [...permissions, ...exclusions];
  let result: EligibilitySignal['result'] = 'UNKNOWN';
  let reasonCodes = ['NO_EXPLICIT_INDIA_REMOTE_EVIDENCE'];
  if (permissions.length && exclusions.length) reasonCodes = ['CONFLICTING_GEOGRAPHY_EVIDENCE'];
  else if (evidence.length && reviewCues.test(text)) reasonCodes = ['CONTEXT_REQUIRES_REVIEW'];
  else if (permissions.length && ['HYBRID', 'ON_SITE'].includes(record.job.workplace)) reasonCodes = ['CONFLICTING_WORKPLACE_METADATA'];
  else if (permissions.length) { result = 'ELIGIBLE'; reasonCodes = ['EXPLICIT_INDIA_REMOTE_PERMISSION']; }
  else if (exclusions.length) { result = 'INELIGIBLE'; reasonCodes = ['EXPLICIT_RESIDENCE_EXCLUSION']; }
  if (!evidence.length && record.job.location) {
    const passage = record.job.location.slice(0, 500);
    evidence.push({ text: passage, field: 'location', start: 0, end: passage.length, sourceUrl: record.job.canonicalUrl, observedAt: record.provenance.observedAt });
  }
  return { context: 'INDIA_REMOTE', result, reasonCodes, evidence, classifierVersion: INDIA_REMOTE_CLASSIFIER_VERSION, disclaimer: DISCLAIMER };
}
