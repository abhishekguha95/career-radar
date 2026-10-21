import { setTimeout as delay } from 'node:timers/promises';
import { SourceError } from './adapter.js';

export interface JsonHttpOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxAttempts?: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  random?: () => number;
  signal?: AbortSignal;
}

// Provider adapters construct URLs; posting content never supplies request targets.
export class BoundedJsonClient {
  private readonly options: Required<JsonHttpOptions>;

  constructor(private readonly provider: string, options: JsonHttpOptions = {}) {
    this.options = {
      timeoutMs: 10_000, maxResponseBytes: 8 * 1024 * 1024, maxAttempts: 3,
      fetch: globalThis.fetch, sleep: (ms) => delay(ms, undefined, { signal: options.signal }),
      now: () => new Date(), random: Math.random, signal: new AbortController().signal, ...options,
    };
    const { timeoutMs, maxResponseBytes, maxAttempts } = this.options;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000
      || !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 8 * 1024 * 1024
      || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('Invalid HTTP limits');
  }

  async get(url: URL): Promise<unknown> {
    if (this.options.signal.aborted) throw new SourceError('ABORTED', `${this.provider} fetch was interrupted`);
    await this.options.sleep(250);
    for (let attempt = 0; attempt < this.options.maxAttempts; attempt++) {
      if (this.options.signal.aborted) throw new SourceError('ABORTED', `${this.provider} fetch was interrupted`);
      try { return await this.request(url); }
      catch (error) {
        const failure = error instanceof SourceError ? error : new SourceError('NETWORK_ERROR', `${this.provider} request failed`, true);
        if (!failure.retryable || attempt + 1 >= this.options.maxAttempts || (failure.retryAfterMs ?? 0) > 30_000) throw failure;
        await this.options.sleep(Math.max(failure.retryAfterMs ?? 0, 500 * 2 ** attempt + Math.floor(this.options.random() * 250)));
      }
    }
    throw new SourceError('RETRY_EXHAUSTED', `${this.provider} request exhausted retries`);
  }

  private async request(url: URL): Promise<unknown> {
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
          throw new SourceError('RATE_LIMITED', `${this.provider} rate limit reached`, true, retryAfterMs);
        }
        if ([401, 403].includes(response.status)) throw new SourceError('ACCESS_RESTRICTED', `${this.provider} access is restricted`);
        if (response.status === 404) throw new SourceError('SOURCE_NOT_FOUND', `${this.provider} source was not found`);
        throw new SourceError('HTTP_ERROR', `${this.provider} returned HTTP ${response.status}`, [500, 502, 503, 504].includes(response.status));
      }
      const reader = response.body?.getReader();
      if (!reader) throw new SourceError('INVALID_JSON', `${this.provider} returned an empty response body`);
      const decoder = new TextDecoder();
      let bytes = 0;
      let body = '';
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > this.options.maxResponseBytes) throw new SourceError('RESPONSE_TOO_LARGE', `${this.provider} response exceeded the byte limit`);
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally { await reader.cancel(); reader.releaseLock(); }
      try { return JSON.parse(body) as unknown; }
      catch { throw new SourceError('INVALID_JSON', `${this.provider} returned invalid JSON`); }
    } catch (error) {
      if (this.options.signal.aborted) throw new SourceError('ABORTED', `${this.provider} request was interrupted`);
      if (controller.signal.aborted) throw new SourceError('TIMEOUT', `${this.provider} request timed out`, true);
      throw error;
    } finally { clearTimeout(timer); }
  }
}
