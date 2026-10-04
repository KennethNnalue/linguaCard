import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const revision = process.env.VERCEL_GIT_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync('www/version.json', JSON.stringify({ revision }));
