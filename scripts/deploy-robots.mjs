// scripts/deploy-robots.mjs
// Copies the correct robots.txt for Vercel preview or production deploys
import { promises as fs } from 'fs';
import path from 'path';

const publicDir = path.resolve('apps/coach-dashboard/public');
const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.BTA_ROBOTS_PREVIEW === '1';
const src = isPreview ? 'robots-preview.txt' : 'robots.txt';
const dest = 'robots.txt';

async function main() {
  if (src !== dest) {
    await fs.copyFile(path.join(publicDir, src), path.join(publicDir, dest));
    console.log(`[robots] Copied ${src} -> ${dest}`);
  } else {
    console.log(`[robots] Using default ${dest}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
