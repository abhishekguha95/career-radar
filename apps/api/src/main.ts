import { createPool, loadEnvironment } from '@career-radar/database';
import { z } from 'zod';
import { createApi } from './app.js';

loadEnvironment();
let pool: ReturnType<typeof createPool> | undefined;
try {
  const host = z.enum(['127.0.0.1', '::1']).parse(process.env.API_HOST ?? '127.0.0.1');
  const port = z.coerce.number().int().min(1).max(65535).parse(process.env.API_PORT ?? 3001);
  pool = createPool();
  const app = await createApi(pool, { logging: true });
  await app.listen(port, host);
  console.log(JSON.stringify({ event: 'api_listening', host, port }));
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await pool?.end();
  };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
} catch {
  console.error(JSON.stringify({ level: 'error', code: 'API_START_FAILED', message: 'Check API_HOST, API_PORT, DATABASE_URL and port availability' }));
  await pool?.end();
  process.exitCode = 1;
}
