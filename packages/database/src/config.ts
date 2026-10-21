import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { z } from 'zod';

export function loadEnvironment(): void {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}

export function createPool(connectionString: string | undefined = process.env.DATABASE_URL, schema?: string): Pool {
  if (!connectionString) throw new Error('DATABASE_URL is required; copy .env.example to .env');
  const url = z.url().parse(connectionString);
  if (!['postgres:', 'postgresql:'].includes(new URL(url).protocol)) throw new Error('Expected a PostgreSQL connection URL');
  if (schema && !/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
  const pool = new Pool({
    connectionString, max: 8, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10_000,
    statement_timeout: 10_000, query_timeout: 15_000, application_name: 'career-radar',
    ...(schema ? { options: `-c search_path=${schema},public` } : {}),
  });
  pool.on('error', () => console.error(JSON.stringify({ level: 'error', code: 'DATABASE_IDLE_CONNECTION_ERROR' })));
  return pool;
}
