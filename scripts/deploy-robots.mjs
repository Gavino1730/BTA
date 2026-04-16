// scripts/deploy-robots.mjs
// Copies the correct robots.txt for Vercel preview or production deploys
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const publicDir = path.join(repoRoot, 'apps/coach-dashboard/public');

const vercelEnv = process.env.VERCEL_ENV;
const robotsPreview = process.env.BTA_ROBOTS_PREVIEW;
const isPreview = vercelEnv === 'preview' || robotsPreview === '1';
const src = isPreview ? 'robots-preview.txt' : 'robots.txt';
const dest = 'robots.txt';

async function main() {
  console.log(`[robots] VERCEL_ENV=${vercelEnv} BTA_ROBOTS_PREVIEW=${robotsPreview}`);

  if (src === dest) {
    console.log(`[robots] Using default ${dest} (mode: production)`);
    return;
  }

  const srcPath = path.join(publicDir, src);
  const destPath = path.join(publicDir, dest);

  await fs.copyFile(srcPath, destPath);
  console.log(`[robots] Copied ${src} -> ${dest} (mode: ${isPreview ? 'preview' : 'production'})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
