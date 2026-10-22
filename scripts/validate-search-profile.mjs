import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readSearchProfile, SearchProfileError } from '../packages/core/dist/index.js';

const args = process.argv.slice(2);
if (args.length > 1 || args[0]?.startsWith('-')) {
  console.error(JSON.stringify({ level: 'error', code: 'INVALID_PROFILE_ARGUMENTS', message: 'Usage: npm run profile:validate -- [local-file.json]' }));
  process.exitCode = 1;
} else {
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const result = await readSearchProfile(resolve(root, args[0] ?? '.local/search-profile.json'));
    console.log(JSON.stringify({ event: 'search_profile_validated', schemaVersion: result.profile.schemaVersion,
      profileVersion: result.profileVersion, reviewStatus: result.profile.review.status, schedulerActive: false }));
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', code: error instanceof SearchProfileError ? error.code : 'PROFILE_READ_FAILED',
      message: 'Private search configuration could not be validated; check the file against the documented schema' }));
    process.exitCode = 1;
  }
}
