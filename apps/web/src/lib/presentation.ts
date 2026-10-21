import { jobsQuerySchema } from '@career-radar/contracts';
import type { JobSummary, SourceStatus } from '@career-radar/contracts';
import { z } from 'zod';

export type PageParams = Record<string, string | string[] | undefined>;
export interface Filters { title: string; location: string; workplace: string; mode: string; source: string; freshness: string; page: number; limit: number }
const knownKeys = new Set(['title', 'location', 'workplace', 'mode', 'source', 'freshness', 'page', 'limit', 'job']);

export function parseFilters(params: PageParams, now = new Date()) {
  for (const [key, value] of Object.entries(params)) if (!knownKeys.has(key) || Array.isArray(value)) throw new Error('Unsupported or repeated filter');
  const value = (key: string) => typeof params[key] === 'string' ? params[key].trim() : '';
  const freshness = value('freshness');
  if (freshness && !['1', '7', '30'].includes(freshness)) throw new Error('Invalid freshness window');
  const input: Record<string, string> = { page: value('page') || '1', limit: value('limit') || '6' };
  for (const key of ['title', 'location', 'workplace', 'mode', 'source']) if (value(key)) input[key] = value(key);
  if (freshness) input.observedSince = new Date(now.getTime() - Number(freshness) * 86_400_000).toISOString();
  const query = jobsQuerySchema.parse(input);
  const selectedId = value('job');
  if (selectedId && !z.uuid().safeParse(selectedId).success) throw new Error('Invalid posting selection');
  const filters: Filters = { title: query.title ?? '', location: query.location ?? '', workplace: query.workplace ?? '', mode: query.mode ?? '', source: query.source ?? '', freshness, page: query.page, limit: query.limit };
  return { query, filters, selectedId };
}

export function jobsHref(filters: Filters, changes: Partial<Filters & { job: string }> = {}): string {
  const values = { ...filters, ...changes };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === '' || (key === 'page' && value === 1) || (key === 'limit' && value === 6)) continue;
    params.set(key, String(value));
  }
  return params.size ? `/?${params}` : '/';
}

export function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Not provided';
}
export function observedAgo(value: string, now: string): string {
  const minutes = Math.floor((Date.parse(now) - Date.parse(value)) / 60_000);
  if (minutes < 0) return formatDate(value);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export function sourceLabel(source: Pick<SourceStatus, 'provider' | 'mode' | 'site'>): string {
  return source.mode === 'FIXTURE' ? 'Sample data' : source.provider === 'LEVER' && source.site === 'leverdemo' ? 'Provider demo' : 'Live source';
}
export const workplaceLabel = (value: JobSummary['workplace']) => ({ REMOTE: 'Remote', HYBRID: 'Hybrid', ON_SITE: 'On-site', UNKNOWN: 'Workplace unspecified' })[value];
export const employmentLabel = (value: JobSummary['employmentType']) => ({ FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', INTERNSHIP: 'Internship', TEMPORARY: 'Temporary', UNKNOWN: 'Type unspecified' })[value];
export function geography(job: Pick<JobSummary, 'eligibility'>) {
  if (!job.eligibility) return { label: 'Not assessed', tone: 'neutral', detail: 'India-remote signal has not been assessed.' };
  return {
    ELIGIBLE: { label: 'India remote supported', tone: 'positive', detail: 'The source explicitly supports working remotely from India.' },
    INELIGIBLE: { label: 'Residence restriction', tone: 'negative', detail: 'The source states a residence restriction for this search context.' },
    UNKNOWN: { label: 'Needs verification', tone: 'caution', detail: 'The source does not establish India-remote eligibility.' },
  }[job.eligibility.result];
}
export function sourceHealth(source: SourceStatus) {
  if (!source.latestRun) return { label: 'Not run yet', tone: 'neutral' };
  if (source.latestRun.status === 'RUNNING') return { label: 'Collecting', tone: 'neutral' };
  if (source.latestRun.status === 'ABORTED') return { label: 'Collection interrupted', tone: 'caution' };
  if (source.latestRun.status === 'PARTIAL') return { label: 'Partial collection', tone: 'caution' };
  return { HEALTHY: { label: 'Last run succeeded', tone: 'positive' }, DEGRADED: { label: 'Needs attention', tone: 'caution' }, UNAVAILABLE: { label: 'Last run failed', tone: 'negative' }, UNKNOWN: { label: 'Unknown', tone: 'neutral' } }[source.health];
}
