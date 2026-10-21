import { sourceConfigSchema } from '@career-radar/contracts';
import type { EligibilitySignal, IngestionError, NormalizedRecord, RunCounters, RunStatus, SourceConfig } from '@career-radar/contracts';
import { SourceError } from './adapter.js';
import type { PostingAdapter } from './adapter.js';

export interface IngestionStore {
  upsertSource(source: SourceConfig, mode: 'FIXTURE' | 'LIVE'): Promise<string>;
  acquireSource(sourceId: string): Promise<() => Promise<void>>;
  startRun(sourceId: string): Promise<string>;
  finishRun(runId: string, status: Exclude<RunStatus, 'RUNNING'>, complete: boolean, counters: RunCounters, errors: IngestionError[]): Promise<void>;
  persist(sourceId: string, runId: string, record: NormalizedRecord, assessment?: EligibilitySignal): Promise<'created' | 'updated' | 'unchanged'>;
}

export interface IngestionResult {
  runId: string;
  sourceId: string;
  status: Exclude<RunStatus, 'RUNNING'>;
  complete: boolean;
  counters: RunCounters;
  errors: IngestionError[];
  errorCount: number;
}

export interface IngestionOptions {
  source: SourceConfig;
  mode: 'FIXTURE' | 'LIVE';
  adapter: PostingAdapter;
  store: IngestionStore;
  maxPages?: number;
  signal?: AbortSignal;
  assess?: (record: NormalizedRecord) => EligibilitySignal;
}

function recordId(raw: unknown): string | null {
  if (raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string') return raw.id.slice(0, 200);
  return null;
}

export async function ingest(options: IngestionOptions): Promise<IngestionResult> {
  const { adapter, store, mode, signal } = options;
  const source = sourceConfigSchema.parse(options.source);
  const maxPages = options.maxPages ?? 100;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('maxPages must be an integer between 1 and 100');
  const sourceId = await store.upsertSource(source, mode);
  const release = await store.acquireSource(sourceId);
  try {
    const runId = await store.startRun(sourceId);
    const counters: RunCounters = { fetched: 0, accepted: 0, created: 0, updated: 0, unchanged: 0, rejected: 0 };
    const errors: IngestionError[] = [];
    let errorCount = 0;
    let complete = false;
    let aborted = false;
    const addError = (error: IngestionError) => { errorCount++; if (errors.length < 50) errors.push(error); };
    pages: for (let page = 0; page < maxPages; page++) {
      if (signal?.aborted) { aborted = true; break; }
      let batch;
      try { batch = await adapter.fetchPage(source, page); }
      catch (error) {
        if (signal?.aborted) { aborted = true; break; }
        addError({ code: error instanceof SourceError ? error.code : 'SOURCE_FAILURE', message: error instanceof SourceError ? error.message : 'Source page could not be fetched', page, recordIndex: null, externalId: null });
        break;
      }
      counters.fetched += batch.items.length;
      for (const [recordIndex, raw] of batch.items.entries()) {
        if (signal?.aborted) { aborted = true; break pages; }
        let record: NormalizedRecord;
        try { record = adapter.normalize(raw, source, batch.provenance); }
        catch (error) {
          counters.rejected++;
          addError({ code: error instanceof SourceError ? error.code : 'MALFORMED_RECORD', message: 'Posting failed normalization', page, recordIndex, externalId: recordId(raw) });
          continue;
        }
        try {
          const change = await store.persist(sourceId, runId, record, options.assess?.(record));
          counters.accepted++;
          counters[change]++;
        } catch (error) {
          counters.rejected++;
          const code = error instanceof Error && 'code' in error && error.code === 'STALE_OBSERVATION' ? 'STALE_OBSERVATION' : 'PERSISTENCE_FAILURE';
          addError({ code, message: code === 'STALE_OBSERVATION' ? 'Older changed observation rejected' : 'Posting transaction failed', page, recordIndex, externalId: record.job.externalId });
          // An expected record-level stale observation is recoverable; unknown storage errors stop this crawl.
          if (code !== 'STALE_OBSERVATION') break pages;
        }
      }
      if (!batch.hasMore) { complete = true; break; }
      if (page + 1 === maxPages) addError({ code: 'PAGE_LIMIT', message: 'Crawl stopped at the configured page limit', page, recordIndex: null, externalId: null });
    }
    if (aborted) addError({ code: 'ABORTED', message: 'Ingestion interrupted by the caller', page: null, recordIndex: null, externalId: null });
    const status = aborted ? 'ABORTED' : complete && errorCount === 0 ? 'SUCCEEDED' : counters.accepted > 0 ? 'PARTIAL' : 'FAILED';
    if (errorCount > errors.length) errors[49] = { code: 'ERRORS_TRUNCATED', message: `${errorCount - 49} additional errors omitted`, page: null, recordIndex: null, externalId: null };
    await store.finishRun(runId, status, complete, counters, errors);
    return { runId, sourceId, status, complete, counters, errors, errorCount };
  } finally { await release(); }
}
