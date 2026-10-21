import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export default {
  poweredByHeader: false,
  transpilePackages: ['@career-radar/contracts'],
  devIndicators: false,
};
