import { z } from 'zod';

export const sourceConfigSchema = z.object({
  provider: z.literal('LEVER'),
  region: z.enum(['global', 'eu']),
  site: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/),
  employer: z.string().trim().min(1).max(200),
}).strict();
export type SourceConfig = z.infer<typeof sourceConfigSchema>;

export const workplaceSchema = z.enum(['REMOTE', 'HYBRID', 'ON_SITE', 'UNKNOWN']);
export type Workplace = z.infer<typeof workplaceSchema>;
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'TEMPORARY' | 'UNKNOWN';

export interface NormalizedJob {
  externalId: string;
  employer: string;
  title: string;
  description: string | null;
  location: string | null;
  allLocations: string[];
  country: string | null;
  workplace: Workplace;
  workplaceRaw: string | null;
  employmentType: EmploymentType;
  employmentTypeRaw: string | null;
  canonicalUrl: string;
  applyUrl: string | null;
  postedAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface Provenance {
  requestUrl: string;
  observedAt: string;
  mappingVersion: string;
  mode: 'FIXTURE' | 'LIVE';
  page: number;
}

export interface NormalizedRecord {
  job: NormalizedJob;
  raw: Record<string, unknown>;
  provenance: Provenance;
}

export interface IngestionError {
  code: string;
  message: string;
  page: number | null;
  recordIndex: number | null;
  externalId: string | null;
}

export type EligibilityResult = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
export interface EligibilityEvidence {
  text: string;
  field: 'description' | 'location';
  start: number;
  end: number;
  sourceUrl: string;
  observedAt: string;
}
export interface EligibilitySignal {
  context: 'INDIA_REMOTE';
  result: EligibilityResult;
  reasonCodes: string[];
  evidence: EligibilityEvidence[];
  classifierVersion: string;
  disclaimer: string;
}

export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'ABORTED';
export interface RunCounters {
  fetched: number;
  accepted: number;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

const positiveInteger = z.string().regex(/^[1-9]\d{0,4}$/).transform(Number);
export const jobsQuerySchema = z.object({
  page: positiveInteger.pipe(z.number().max(10_000)).default(1),
  limit: positiveInteger.pipe(z.number().max(100)).default(20),
  title: z.string().trim().min(1).max(200).optional(),
  source: z.uuid().optional(),
  location: z.string().trim().min(1).max(200).optional(),
  observedSince: z.iso.datetime({ offset: true }).optional(),
  workplace: workplaceSchema.optional(),
  mode: z.enum(['FIXTURE', 'LIVE']).optional(),
}).strict();
export type JobsQuery = z.infer<typeof jobsQuerySchema>;
