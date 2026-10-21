import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPool, JobRepository, loadEnvironment, migrate } from '../packages/database/dist/index.js';
import { FixtureAdapter, ingest, readFixture } from '../packages/core/dist/index.js';

loadEnvironment();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('UI tests require a dedicated TEST_DATABASE_URL ending in _test');
const schema = `ui_${randomUUID().replaceAll('-', '')}`;
const admin = createPool(databaseUrl);
const pool = createPool(databaseUrl, schema);
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool, schema);
  const store = new JobRepository(pool);
  for (const path of ['baseline', 'changed', 'partial']) {
    const fixture = await readFixture(`fixtures/lever/${path}.json`);
    await ingest({ source: fixture.source, adapter: new FixtureAdapter(fixture), mode: 'FIXTURE', store });
  }
  await store.upsertSource({ provider: 'LEVER', region: 'eu', site: 'fixture-not-run', employer: 'Waiting Fictional Source' }, 'LIVE');
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)), 'test'], {
      stdio: 'inherit', env: {
        ...process.env, DATABASE_URL: url.toString(), API_PORT: '3101', PORT: '3100',
        CAREER_RADAR_API_ORIGIN: 'http://127.0.0.1:3101', CAREER_RADAR_UI_URL: 'http://127.0.0.1:3100',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });
    child.on('error', reject);
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  process.exitCode = Number(code);
} finally {
  await pool.end();
  if (!/^ui_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid generated schema');
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
