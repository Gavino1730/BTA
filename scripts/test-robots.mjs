// scripts/test-robots.mjs
// Prints which robots.txt mode is active and its contents
import { promises as fs } from 'fs';
import path from 'path';

const publicDir = path.resolve('apps/coach-dashboard/public');
const vercelEnv = process.env.VERCEL_ENV;
const robotsPreview = process.env.BTA_ROBOTS_PREVIEW;
const isPreview = vercelEnv === 'preview' || robotsPreview === '1';
const robotsPath = path.join(publicDir, 'robots.txt');

async function main() {
  console.log(`[robots-test] VERCEL_ENV=${vercelEnv} BTA_ROBOTS_PREVIEW=${robotsPreview}`);
  console.log(`[robots-test] Mode: ${isPreview ? 'preview (should be Disallow: /)' : 'production (should be Allow: /)'}`);
  const contents = await fs.readFile(robotsPath, 'utf8');
  console.log(`[robots-test] robots.txt contents:\n${contents}`);
}

main().catch(e => { console.error(e); process.exit(1); });
