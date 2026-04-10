// scripts/deploy-robots.mjs
// Copies the correct robots.txt for Vercel preview or production deploys
import { promises as fs } from 'fs';
import path from 'path';

const publicDir = path.resolve('apps/coach-dashboard/public');
const vercelEnv = process.env.VERCEL_ENV;
const robotsPreview = process.env.BTA_ROBOTS_PREVIEW;
const isPreview = vercelEnv === 'preview' || robotsPreview === '1';
const src = isPreview ? 'robots-preview.txt' : 'robots.txt';
const dest = 'robots.txt';

async function main() {
  console.log(`[robots] VERCEL_ENV=${vercelEnv} BTA_ROBOTS_PREVIEW=${robotsPreview}`);
  if (src !== dest) {
    await fs.copyFile(path.join(publicDir, src), path.join(publicDir, dest));
    console.log(`[robots] Copied ${src} -> ${dest} (mode: ${isPreview ? 'preview' : 'production'})`);
  } else {
    console.log(`[robots] Using default ${dest} (mode: production)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
