import { sourceConfigSchema } from '@career-radar/contracts';
import type { EmploymentType, NormalizedRecord, Provenance, SourceConfig, Workplace } from '@career-radar/contracts';
import { convert } from 'html-to-text';
import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { SourceError } from './adapter.js';
import type { PostingAdapter, SourcePage } from './adapter.js';

export const LEVER_MAPPING_VERSION = 'lever-v1';
const sourceText = z.string().max(500_000);
const optionalText = sourceText.nullish();
const webUrl = z.url().max(4000).refine((value) => {
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
}, 'Expected an HTTP(S) URL without credentials');
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

function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
    ],
  }).trim();
}

const workplaceMap: Record<string, Workplace> = { remote: 'REMOTE', hybrid: 'HYBRID', 'on-site': 'ON_SITE' };
const employmentMap: Record<string, EmploymentType> = {
  'full-time': 'FULL_TIME', 'full time': 'FULL_TIME', fulltime: 'FULL_TIME',
  'part-time': 'PART_TIME', 'part time': 'PART_TIME',
  contract: 'CONTRACT', contractor: 'CONTRACT', internship: 'INTERNSHIP', temporary: 'TEMPORARY',
};

export function normalizeLever(raw: unknown, source: SourceConfig, provenance: Provenance): NormalizedRecord {
  const config = sourceConfigSchema.parse(source);
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

export interface LeverOptions {
  pageSize?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxAttempts?: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  random?: () => number;
  signal?: AbortSignal;
}

export class LeverAdapter implements PostingAdapter {
  private readonly options: Required<LeverOptions>;

  constructor(options: LeverOptions = {}) {
    this.options = {
      pageSize: 100, timeoutMs: 10_000, maxResponseBytes: 8 * 1024 * 1024, maxAttempts: 3,
      fetch: globalThis.fetch,
      sleep: (ms) => delay(ms, undefined, { signal: options.signal }),
      now: () => new Date(), random: Math.random,
      signal: new AbortController().signal,
      ...options,
    };
    const { pageSize, timeoutMs, maxResponseBytes, maxAttempts } = this.options;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || timeoutMs < 1 || maxResponseBytes < 1 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
      throw new Error('Invalid Lever adapter limits');
    }
  }

  normalize = normalizeLever;

  async fetchPage(source: SourceConfig, page: number): Promise<SourcePage> {
    const config = sourceConfigSchema.parse(source);
    if (!Number.isSafeInteger(page) || page < 0 || page > 99) throw new SourceError('PAGE_LIMIT', 'Page outside supported bounds');
    const host = config.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const url = new URL(`https://${host}/v0/postings/${config.site}`);
    url.search = new URLSearchParams({ mode: 'json', skip: String(page * this.options.pageSize), limit: String(this.options.pageSize) }).toString();

    // Pace every page, including the first, independently of retry backoff.
    await this.options.sleep(250);
    for (let attempt = 0; attempt < this.options.maxAttempts; attempt++) {
      if (this.options.signal.aborted) throw new SourceError('ABORTED', 'Lever fetch was interrupted');
      try {
        const items = await this.request(url);
        return {
          items,
          hasMore: items.length >= this.options.pageSize,
          provenance: { requestUrl: url.toString(), observedAt: this.options.now().toISOString(), mappingVersion: LEVER_MAPPING_VERSION, mode: 'LIVE', page },
        };
      } catch (error) {
        const failure = error instanceof SourceError ? error : new SourceError('NETWORK_ERROR', 'Lever request failed', true);
        if (!failure.retryable || attempt + 1 >= this.options.maxAttempts || (failure.retryAfterMs ?? 0) > 30_000) throw failure;
        const delay = Math.max(failure.retryAfterMs ?? 0, 500 * 2 ** attempt + Math.floor(this.options.random() * 250));
        await this.options.sleep(delay);
      }
    }
    throw new SourceError('RETRY_EXHAUSTED', 'Lever request exhausted retries');
  }

  private async request(url: URL): Promise<unknown[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.options.fetch(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.any([controller.signal, this.options.signal]),
        headers: { Accept: 'application/json', 'User-Agent': 'CareerRadar/0.1 (+https://github.com/abhishekguha95/career-radar)' },
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) {
          const header = response.headers.get('retry-after');
          let retryAfterMs: number | null = null;
          if (header) {
            retryAfterMs = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - this.options.now().getTime();
            if (!Number.isFinite(retryAfterMs)) retryAfterMs = null;
          }
          throw new SourceError('RATE_LIMITED', 'Lever rate limit reached', true, retryAfterMs);
        }
        if ([401, 403].includes(response.status)) throw new SourceError('ACCESS_RESTRICTED', 'Lever access is restricted');
        if (response.status === 404) throw new SourceError('SOURCE_NOT_FOUND', 'Lever source was not found');
        throw new SourceError('HTTP_ERROR', `Lever returned HTTP ${response.status}`, [500, 502, 503, 504].includes(response.status));
      }
      const reader = response.body?.getReader();
      if (!reader) throw new SourceError('INVALID_JSON', 'Lever returned an empty response body');
      const decoder = new TextDecoder();
      let bytes = 0;
      let body = '';
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > this.options.maxResponseBytes) throw new SourceError('RESPONSE_TOO_LARGE', 'Lever response exceeded the byte limit');
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      let payload: unknown;
      try { payload = JSON.parse(body); } catch { throw new SourceError('INVALID_JSON', 'Lever returned invalid JSON'); }
      if (!Array.isArray(payload)) throw new SourceError('MALFORMED_PAYLOAD', 'Lever list response must be an array');
      if (payload.length > this.options.pageSize) throw new SourceError('MALFORMED_PAYLOAD', 'Lever response exceeds the requested page size');
      return payload;
    } catch (error) {
      if (this.options.signal.aborted) throw new SourceError('ABORTED', 'Lever fetch was interrupted');
      if (controller.signal.aborted) throw new SourceError('TIMEOUT', 'Lever request timed out', true);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
