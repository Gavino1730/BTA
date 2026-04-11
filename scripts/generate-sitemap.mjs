import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROUTES = [
  "/",
  "/product",
  "/how-it-works",
  "/pricing",
  "/compare",
  "/features",
  "/about",
  "/support",
  "/contact",
  "/terms",
  "/privacy",
  "/data-deletion",
  "/help",
  "/docs",
  "/login",
];

function normalizeBaseUrl(rawValue) {
  const input = String(rawValue || "https://www.btaintel.com").trim().replace(/\/+$/, "");
  try {
    return new URL(input).toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`Invalid SITE_URL: ${input}`);
  }
}

function buildSitemapXml(baseUrl) {
  const urls = ROUTES.map((route) => {
    const loc = route === "/" ? `${baseUrl}/` : `${baseUrl}${route}`;
    return `  <url><loc>${loc}</loc></url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SITE_URL);
  const xml = buildSitemapXml(baseUrl);
  const outputPath = resolve("apps/coach-dashboard/public/sitemap.xml");
  await writeFile(outputPath, xml, "utf8");
  console.log(`[seo] sitemap generated at ${outputPath} using ${baseUrl}`);
}

void main();
