import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sourceConfigSchema } from '@career-radar/contracts';
import { FixtureAdapter, ingest, LeverAdapter, readFixture } from '@career-radar/core';
import { createPool, JobRepository, loadEnvironment } from '@career-radar/database';

const help = `Career Radar ingestion (GET-only; no application submission)
  pnpm ingest --fixture fixtures/lever/baseline.json
  pnpm ingest --site <lever-site> --employer "Employer name" [--region global|eu]
  Optional bounds: --max-pages 1..100; --page-size 1..100 (live only)
  Exit codes: 0 succeeded; 2 partial; 1 failed/input error; 130 interrupted.`;

loadEnvironment();
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
let pool: ReturnType<typeof createPool> | undefined;
try {
  const { values } = parseArgs({ options: {
    fixture: { type: 'string' }, site: { type: 'string' }, employer: { type: 'string' },
    region: { type: 'string' }, 'max-pages': { type: 'string' }, 'page-size': { type: 'string' }, help: { type: 'boolean' },
  }, strict: true, allowPositionals: false });
  if (values.help) console.log(help);
  else {
    const maxPages = Number(values['max-pages'] ?? 100);
    const pageSize = Number(values['page-size'] ?? 100);
    if (![maxPages, pageSize].every((value) => Number.isInteger(value) && value >= 1 && value <= 100)) throw new Error('INVALID_INPUT');
    if (values.fixture && (values.site || values.employer || values.region || values['page-size'])) throw new Error('INVALID_INPUT');
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const fixture = values.fixture ? await readFixture(resolve(root, values.fixture)) : null;
    const source = sourceConfigSchema.parse(fixture?.source ?? { provider: 'LEVER', region: values.region ?? 'global', site: values.site, employer: values.employer });
    const adapter = fixture ? new FixtureAdapter(fixture) : new LeverAdapter({ pageSize, signal: controller.signal });
    pool = createPool();
    const result = await ingest({ source, mode: fixture ? 'FIXTURE' : 'LIVE', adapter, store: new JobRepository(pool), maxPages, signal: controller.signal });
    console.log(JSON.stringify({ event: 'ingestion_complete', ...result }));
    process.exitCode = result.status === 'SUCCEEDED' ? 0 : result.status === 'PARTIAL' ? 2 : result.status === 'ABORTED' ? 130 : 1;
  }
} catch (error) {
  const code = error instanceof Error && 'code' in error && error.code === 'SOURCE_BUSY' ? 'SOURCE_BUSY' : 'INGESTION_FAILED';
  console.error(JSON.stringify({ level: 'error', code, message: code === 'SOURCE_BUSY' ? 'Source already has an active run' : 'Check arguments, fixture path, environment and database readiness; run --help' }));
  process.exitCode = 1;
} finally {
  await pool?.end();
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
