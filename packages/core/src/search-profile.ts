import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { searchProfileSchema } from '@career-radar/contracts';
import type { SearchProfile } from '@career-radar/contracts';

export const MAX_SEARCH_PROFILE_BYTES = 128 * 1024;
export type SearchProfileErrorCode = 'PROFILE_READ_FAILED' | 'PROFILE_TOO_LARGE' | 'PROFILE_INVALID_JSON' | 'PROFILE_INVALID';

export class SearchProfileError extends Error {
  constructor(readonly code: SearchProfileErrorCode) {
    super('Private search configuration could not be validated'); this.name = 'SearchProfileError';
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function validateSearchProfile(input: unknown): { profile: SearchProfile; profileVersion: string } {
  const result = searchProfileSchema.safeParse(input);
  // Never propagate parser issues or candidate values into CLI logs.
  if (!result.success) throw new SearchProfileError('PROFILE_INVALID');
  const profile = result.data;
  const digest = createHash('sha256').update(JSON.stringify(canonical(profile))).digest('hex');
  return { profile, profileVersion: `search-profile-v1:sha256:${digest}` };
}

export async function readSearchProfile(path: string): Promise<ReturnType<typeof validateSearchProfile>> {
  try {
    const handle = await open(path, 'r');
    let bytes: Buffer;
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) throw new SearchProfileError('PROFILE_READ_FAILED');
      if (metadata.size > MAX_SEARCH_PROFILE_BYTES) throw new SearchProfileError('PROFILE_TOO_LARGE');
      const buffer = Buffer.alloc(MAX_SEARCH_PROFILE_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await handle.read(buffer, size, buffer.length - size, null);
        if (result.bytesRead === 0) break;
        size += result.bytesRead;
      }
      if (size > MAX_SEARCH_PROFILE_BYTES) throw new SearchProfileError('PROFILE_TOO_LARGE');
      bytes = buffer.subarray(0, size);
    } finally { await handle.close(); }
    let input: unknown;
    try { input = JSON.parse(bytes.toString('utf8')) as unknown; }
    catch { throw new SearchProfileError('PROFILE_INVALID_JSON'); }
    return validateSearchProfile(input);
  } catch (error) {
    if (error instanceof SearchProfileError) throw error;
    throw new SearchProfileError('PROFILE_READ_FAILED');
  }
}
