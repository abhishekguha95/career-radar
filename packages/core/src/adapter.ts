import type { NormalizedRecord, Provenance, SourceConfig } from '@career-radar/contracts';

export interface SourcePage {
  items: unknown[];
  provenance: Provenance;
  hasMore: boolean;
}

export interface PostingAdapter {
  fetchPage(source: SourceConfig, page: number): Promise<SourcePage>;
  normalize(raw: unknown, source: SourceConfig, provenance: Provenance): NormalizedRecord;
}

export class SourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}
