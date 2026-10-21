import { randomUUID } from 'node:crypto';
import { createPool, loadEnvironment, migrate } from '../../packages/database/src/index.js';

export async function testDatabase() {
  loadEnvironment();
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString || !new URL(connectionString).pathname.endsWith('_test')) {
    throw new Error('Set TEST_DATABASE_URL to a dedicated database ending in _test; see README');
  }
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = createPool(connectionString);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = createPool(connectionString, schema);
  try { await migrate(pool, schema); }
  catch (error) {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    throw error;
  }
  return {
    pool, schema,
    async close() {
      await pool.end();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    },
  };
}
