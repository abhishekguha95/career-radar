import { jobDetailResponseSchema, jobsResponseSchema, sourcesResponseSchema } from '@career-radar/contracts';
import type { JobsQuery } from '@career-radar/contracts';
import type { z } from 'zod';

export class ApiReadError extends Error {
  constructor(readonly status: number, readonly requestId: string | null = null) { super('Stored data could not be loaded'); }
}

function apiOrigin(): string {
  const url = new URL(process.env.CAREER_RADAR_API_ORIGIN ?? `http://127.0.0.1:${process.env.API_PORT ?? 3001}`);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CAREER_RADAR_API_ORIGIN must be a loopback origin');
  }
  return url.origin;
}

async function read<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiOrigin()}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); }
  catch { throw new ApiReadError(503); }
  if (!response.ok) throw new ApiReadError(response.status, response.headers.get('x-request-id'));
  try { return schema.parse(await response.json()); }
  catch { throw new ApiReadError(502, response.headers.get('x-request-id')); }
}

export function readJobs(query: JobsQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  return read(`/jobs?${params}`, jobsResponseSchema);
}
export const readSources = () => read('/sources', sourcesResponseSchema);
export const readJob = (id: string) => read(`/jobs/${encodeURIComponent(id)}`, jobDetailResponseSchema);
