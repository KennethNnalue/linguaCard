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
const updated = readFileSync(file, 'utf8').replace('%%API_URL%%', apiUrl);
writeFileSync(file, updated);
console.log(`environment.prod.ts → apiUrl set to ${apiUrl}`);
