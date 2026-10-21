import { sourceConfigSchema } from '@career-radar/contracts';
import type { EmploymentType, NormalizedRecord, Provenance, SourceConfig, Workplace } from '@career-radar/contracts';
import { z } from 'zod';
import { SourceError } from './adapter.js';
import type { PostingAdapter, SourcePage } from './adapter.js';

import { BoundedJsonClient } from './http.js';
import type { JsonHttpOptions } from './http.js';
import { htmlToText, sourceWebUrlSchema } from './text.js';

export const LEVER_MAPPING_VERSION = 'lever-v1';
const sourceText = z.string().max(500_000);
const optionalText = sourceText.nullish();
const webUrl = sourceWebUrlSchema;
const epochMilliseconds = z.number().int().min(0).max(8_640_000_000_000_000).nullish();

const leverJobSchema = z.object({
  id: z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/),
  text: z.string().trim().min(1).max(500),
  hostedUrl: webUrl,
  applyUrl: webUrl.nullish(),
  descriptionPlain: optionalText,
  description: optionalText,
  additionalPlain: optionalText,
  additional: optionalText,
  categories: z.object({
    location: optionalText,
    allLocations: z.array(z.string().max(1000)).max(200).nullish(),
    commitment: optionalText,
  }).passthrough().nullish(),
  country: z.string().regex(/^[A-Z]{2}$/).nullish(),
  workplaceType: z.string().max(100).nullish(),
  createdAt: epochMilliseconds,
  // Retain a supplied epoch timestamp without synthesizing a date when absent.
  updatedAt: epochMilliseconds,
  lists: z.array(z.object({ text: optionalText, content: optionalText }).passthrough()).max(100).nullish(),
}).passthrough();

const workplaceMap: Record<string, Workplace> = { remote: 'REMOTE', hybrid: 'HYBRID', 'on-site': 'ON_SITE' };
const employmentMap: Record<string, EmploymentType> = {
  'full-time': 'FULL_TIME', 'full time': 'FULL_TIME', fulltime: 'FULL_TIME',
  'part-time': 'PART_TIME', 'part time': 'PART_TIME',
  contract: 'CONTRACT', contractor: 'CONTRACT', internship: 'INTERNSHIP', temporary: 'TEMPORARY',
};

export function normalizeLever(raw: unknown, source: SourceConfig, provenance: Provenance): NormalizedRecord {
  const config = sourceConfigSchema.parse(source);
  if (config.provider !== 'LEVER') throw new SourceError('SOURCE_MISMATCH', 'Lever requires a Lever source');
  const parsed = leverJobSchema.safeParse(raw);
  if (!parsed.success) {
    // Do not put untrusted source text/URLs into logs or error messages.
    throw new SourceError('MALFORMED_RECORD', 'Posting does not satisfy the Lever mapping contract');
  }
  const item = parsed.data;
  const descriptionParts = [
    item.descriptionPlain?.trim() || (item.description ? htmlToText(item.description) : ''),
    ...(item.lists ?? []).map((list) => [list.text?.trim(), list.content ? htmlToText(list.content) : ''].filter(Boolean).join('\n')),
    item.additionalPlain?.trim() || (item.additional ? htmlToText(item.additional) : ''),
  ].filter(Boolean);
  return {
    job: {
      externalId: item.id,
      employer: config.employer,
      title: item.text,
      description: descriptionParts.join('\n\n') || null,
      location: item.categories?.location?.trim() || null,
      allLocations: item.categories?.allLocations ?? [],
      country: item.country ?? null,
      workplace: workplaceMap[item.workplaceType ?? ''] ?? 'UNKNOWN',
      workplaceRaw: item.workplaceType ?? null,
      employmentType: employmentMap[item.categories?.commitment?.trim().toLowerCase() ?? ''] ?? 'UNKNOWN',
      employmentTypeRaw: item.categories?.commitment ?? null,
      canonicalUrl: item.hostedUrl,
      applyUrl: item.applyUrl ?? null,
      postedAt: item.createdAt == null ? null : new Date(item.createdAt).toISOString(),
      sourceUpdatedAt: item.updatedAt == null ? null : new Date(item.updatedAt).toISOString(),
    },
    raw: raw as Record<string, unknown>,
    provenance,
  };
}

export interface LeverOptions extends JsonHttpOptions { pageSize?: number }

export class LeverAdapter implements PostingAdapter {
  private readonly client: BoundedJsonClient;
  private readonly pageSize: number;
  private readonly now: () => Date;

  constructor(options: LeverOptions = {}) {
    this.pageSize = options.pageSize ?? 100;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 100) throw new Error('Invalid Lever page size');
    this.now = options.now ?? (() => new Date());
    this.client = new BoundedJsonClient('Lever', options);
  }

  normalize = normalizeLever;

  async fetchPage(source: SourceConfig, page: number): Promise<SourcePage> {
    const config = sourceConfigSchema.parse(source);
    if (config.provider !== 'LEVER') throw new SourceError('SOURCE_MISMATCH', 'Lever requires a Lever source');
    if (!Number.isSafeInteger(page) || page < 0 || page > 99) throw new SourceError('PAGE_LIMIT', 'Page outside supported bounds');
    const host = config.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const url = new URL(`https://${host}/v0/postings/${config.site}`);
    url.search = new URLSearchParams({ mode: 'json', skip: String(page * this.pageSize), limit: String(this.pageSize) }).toString();
    const items = await this.client.get(url);
    if (!Array.isArray(items)) throw new SourceError('MALFORMED_PAYLOAD', 'Lever list response must be an array');
    if (items.length > this.pageSize) throw new SourceError('MALFORMED_PAYLOAD', 'Lever response exceeds the requested page size');
    return {
      items, hasMore: items.length >= this.pageSize,
      provenance: { requestUrl: url.toString(), observedAt: this.now().toISOString(), mappingVersion: LEVER_MAPPING_VERSION, mode: 'LIVE', page },
    };
  }
}
