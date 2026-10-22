import { z } from 'zod';

export * from './search-profile.js';

export const sourceProviderSchema = z.enum(['LEVER', 'GREENHOUSE']);
const sourceIdentitySchema = z.object({
  provider: sourceProviderSchema,
  region: z.enum(['global', 'eu']),
}).refine((source) => source.provider !== 'GREENHOUSE' || source.region === 'global', 'Greenhouse supports only the documented global board endpoint');

export const sourceConfigSchema = sourceIdentitySchema.safeExtend({
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

// Wire contracts shared by the API's consumers; validation keeps untrusted data out of links/UI state.
const timestamp = z.iso.datetime({ offset: true });
const safeWebUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Expected an HTTP(S) URL without credentials');
const sourceViewSchema = sourceIdentitySchema.safeExtend({
  id: z.uuid(), site: z.string(),
  mode: z.enum(['FIXTURE', 'LIVE']), health: z.enum(['UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNAVAILABLE']),
  lastSuccessfulRunAt: timestamp.nullable(),
});
const latestRunSchema = z.object({
  id: z.uuid(), status: z.enum(['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'ABORTED']),
  complete: z.boolean(), startedAt: timestamp, finishedAt: timestamp.nullable(),
});
const eligibilityWireSchema = z.object({
  context: z.literal('INDIA_REMOTE'), result: z.enum(['ELIGIBLE', 'INELIGIBLE', 'UNKNOWN']),
  reasonCodes: z.array(z.string()), classifierVersion: z.string(), disclaimer: z.string(),
  evidence: z.array(z.object({ text: z.string(), field: z.enum(['description', 'location']), start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), sourceUrl: safeWebUrl, observedAt: timestamp })),
});
const provenanceWireSchema = z.object({
  requestUrl: z.string(), observedAt: timestamp, mappingVersion: z.string(),
  mode: z.enum(['FIXTURE', 'LIVE']), page: z.number().int().nonnegative(),
});
export const jobSummarySchema = z.object({
  id: z.uuid(), opportunityId: z.uuid(), externalId: z.string(), employer: z.string(), title: z.string(),
  location: z.string().nullable(), allLocations: z.array(z.string()), country: z.string().nullable(),
  workplace: workplaceSchema, workplaceRaw: z.string().nullable(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'UNKNOWN']), employmentTypeRaw: z.string().nullable(),
  canonicalUrl: safeWebUrl, applyUrl: safeWebUrl.nullable(), postedAt: timestamp.nullable(), sourceUpdatedAt: timestamp.nullable(),
  firstSeenAt: timestamp, lastSeenAt: timestamp, externalStatus: z.enum(['PUBLISHED', 'UNKNOWN', 'CLOSED']),
  source: sourceViewSchema, latestRun: latestRunSchema, eligibility: eligibilityWireSchema.nullable(),
});
export const jobsResponseSchema = z.object({
  data: z.array(jobSummarySchema),
  pagination: z.object({ page: z.number().int().positive(), limit: z.number().int().positive().max(100), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(), hasNext: z.boolean() }),
});
export const jobDetailSchema = jobSummarySchema.extend({
  description: z.string().nullable(),
  provenance: z.object({
    latestObservation: provenanceWireSchema,
    currentSnapshot: provenanceWireSchema.extend({ id: z.uuid(), revision: z.number().int().positive(), raw: z.record(z.string(), z.unknown()), contentHash: z.string(), recordedAt: timestamp }),
    history: z.object({ total: z.number().int().nonnegative(), hasMore: z.boolean(), data: z.array(z.object({ id: z.uuid(), revision: z.number().int().positive(), title: z.string(), observedAt: timestamp, mappingVersion: z.string(), contentHash: z.string() })) }),
  }),
});
export const jobDetailResponseSchema = z.object({ data: jobDetailSchema });
export const sourceStatusSchema = sourceViewSchema.safeExtend({
  employer: z.string(), jobCount: z.number().int().nonnegative(), remoteCount: z.number().int().nonnegative(),
  latestRun: latestRunSchema.nullable(),
});
export const sourcesResponseSchema = z.object({ data: z.array(sourceStatusSchema) });
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobsResponse = z.infer<typeof jobsResponseSchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
