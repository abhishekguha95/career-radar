import { sourceConfigSchema } from '@career-radar/contracts';
import type { NormalizedRecord, Provenance, SourceConfig } from '@career-radar/contracts';
import { z } from 'zod';
import { SourceError } from './adapter.js';
import type { PostingAdapter, SourcePage } from './adapter.js';
import { BoundedJsonClient } from './http.js';
import type { JsonHttpOptions } from './http.js';
import { htmlToText, sourceWebUrlSchema } from './text.js';

export const GREENHOUSE_MAPPING_VERSION = 'greenhouse-v1';
const timestamp = z.iso.datetime({ offset: true }).nullish();
const jobSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: z.string().trim().min(1).max(500), absolute_url: sourceWebUrlSchema,
  content: z.string().max(500_000).nullish(),
  location: z.object({ name: z.string().max(1000).nullish() }).passthrough().nullish(),
  offices: z.array(z.object({ location: z.string().max(1000).nullish() }).passthrough()).max(200).nullish(),
  first_published: timestamp, updated_at: timestamp,
}).passthrough();
const envelopeSchema = z.object({
  jobs: z.array(z.unknown()).max(10_000), meta: z.object({ total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).passthrough(),
}).passthrough();

function greenhouseSource(source: SourceConfig): SourceConfig {
  const config = sourceConfigSchema.parse(source);
  if (config.provider !== 'GREENHOUSE') throw new SourceError('SOURCE_MISMATCH', 'Greenhouse requires a Greenhouse source');
  return config;
}

export function normalizeGreenhouse(raw: unknown, source: SourceConfig, provenance: Provenance): NormalizedRecord {
  const config = greenhouseSource(source);
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) throw new SourceError('MALFORMED_RECORD', 'Posting does not satisfy the Greenhouse mapping contract');
  const item = parsed.data;
  const location = item.location?.name?.trim() || null;
  // Greenhouse documents entity-escaped HTML; some boards return direct HTML.
  // Decode the outer representation before stripping its markup, never execute it.
  const content = item.content ?? '';
  const description = htmlToText(/^\s*&lt;[a-z]/i.test(content) ? htmlToText(content) : content) || null;
  return {
    job: {
      externalId: String(item.id), employer: config.employer, title: item.title,
      description,
      location, allLocations: [...new Set([location, ...(item.offices ?? []).map((office) => office.location?.trim())].filter((value): value is string => Boolean(value)))],
      country: null, workplace: 'UNKNOWN', workplaceRaw: null, employmentType: 'UNKNOWN', employmentTypeRaw: null,
      canonicalUrl: item.absolute_url, applyUrl: item.absolute_url,
      postedAt: item.first_published == null ? null : new Date(item.first_published).toISOString(),
      sourceUpdatedAt: item.updated_at == null ? null : new Date(item.updated_at).toISOString(),
    }, raw: raw as Record<string, unknown>, provenance,
  };
}

export class GreenhouseAdapter implements PostingAdapter {
  private readonly client: BoundedJsonClient;
  private readonly now: () => Date;

  constructor(options: JsonHttpOptions = {}) {
    this.client = new BoundedJsonClient('Greenhouse', options);
    this.now = options.now ?? (() => new Date());
  }

  normalize = normalizeGreenhouse;

  async fetchPage(source: SourceConfig, page: number): Promise<SourcePage> {
    const config = greenhouseSource(source);
    if (!Number.isSafeInteger(page) || page < 0 || page > 99) throw new SourceError('PAGE_LIMIT', 'Page outside supported bounds');
    // This list endpoint has no page/skip parameter. A later page means the
    // first response did not reconcile; never refetch it as a different page.
    if (page !== 0) throw new SourceError('INCOMPLETE_ENUMERATION', 'Greenhouse board response did not reconcile with its total');
    const url = new URL(`https://boards-api.greenhouse.io/v1/boards/${config.site}/jobs?content=true`);
    const parsed = envelopeSchema.safeParse(await this.client.get(url));
    if (!parsed.success) throw new SourceError('MALFORMED_PAYLOAD', 'Greenhouse list response does not satisfy the envelope contract');
    const { jobs, meta } = parsed.data;
    const ids = jobs.map((job) => job && typeof job === 'object' && 'id' in job ? job.id : undefined);
    return {
      items: jobs, hasMore: jobs.length !== meta.total || new Set(ids).size !== ids.length,
      provenance: { requestUrl: url.toString(), observedAt: this.now().toISOString(), mappingVersion: GREENHOUSE_MAPPING_VERSION, mode: 'LIVE', page },
    };
  }
}
