import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';

export async function migrate(pool: Pool, schema = 'public'): Promise<number> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid migration schema');
  const client = await pool.connect();
  try {
    const migrations = await runner({
      dbClient: client,
      dir: fileURLToPath(new URL('../migrations', import.meta.url)),
      direction: 'up',
      schema,
      migrationsSchema: schema,
      migrationsTable: 'pgmigrations',
      checkOrder: true,
      singleTransaction: true,
      log: () => {},
    });
    return migrations.length;
  } finally { client.release(); }
}
