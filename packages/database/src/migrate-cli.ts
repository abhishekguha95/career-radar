import { createPool, loadEnvironment } from './config.js';
import { migrate } from './migrate.js';

loadEnvironment();
const pool = createPool();
try {
  console.log(JSON.stringify({ event: 'migrations_complete', applied: await migrate(pool) }));
} catch {
  console.error(JSON.stringify({ level: 'error', code: 'MIGRATION_FAILED', message: 'Migration failed; check database readiness and migration history' }));
  process.exitCode = 1;
} finally { await pool.end(); }
