/**
 * Replaces %%API_URL%% in environment.prod.ts with the API_URL env var.
 * Run before `ng build --configuration=production`.
 */
import { readFileSync, writeFileSync } from 'fs';

const apiUrl = process.env['API_URL'];
if (!apiUrl) {
  console.error('ERROR: API_URL environment variable is not set.');
  console.error('Set it to your Render service URL, e.g. https://linguacard-api.onrender.com');
  process.exit(1);
}

const file = 'apps/mobile/src/environments/environment.prod.ts';
const source = readFileSync(file, 'utf8');
const apiUrlProperty = /apiUrl:\s*['`][^'`]+['`]/;

if (!apiUrlProperty.test(source)) {
  console.error(`ERROR: Could not find apiUrl in ${file}.`);
  process.exit(1);
}

const apiOrigin = apiUrl
  .trim()
  .replace(/\/+$/, '')
  .replace(/(?:\/api\/v1)+$/, '');
const normalizedApiUrl = `${apiOrigin}/api/v1`;
const updated = source.replace(apiUrlProperty, `apiUrl: '${normalizedApiUrl}'`);
writeFileSync(file, updated);
console.log(`environment.prod.ts → apiUrl set to ${normalizedApiUrl}`);
