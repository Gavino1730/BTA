import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targets = [
  {
    name: "operator-ipad",
    url: "http://localhost:5174",
    viewport: { width: 834, height: 1194 }
  },
  {
    name: "coach-desktop",
    url: "http://localhost:5173",
    viewport: { width: 1280, height: 720 }
  }
];

const artifacts = resolve(process.cwd(), "artifacts");
mkdirSync(artifacts, { recursive: true });
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");

const browser = await chromium.launch({ headless: true });
const results = [];

for (const target of targets) {
  const context = await browser.newContext({ viewport: target.viewport });
  const page = await context.newPage();
  await page.goto(target.url, { waitUntil: "networkidle", timeout: 60_000 });

  const metrics = await page.evaluate(() => {
    const headingCount = document.querySelectorAll("h1, h2, h3").length;
    const buttonCount = document.querySelectorAll("button").length;
    const inputCount = document.querySelectorAll("input, select, textarea").length;
    const hasHorizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;

    const tapTargets = Array.from(document.querySelectorAll("button, input, select, textarea"));
    const smallTapTargets = tapTargets.filter((node) => {
      const element = node;
      const rect = element.getBoundingClientRect();
      return rect.width < 40 || rect.height < 40;
    }).length;

    return {
      title: document.title,
      headingCount,
      buttonCount,
      inputCount,
      hasHorizontalOverflow,
      smallTapTargets,
      bodyTextLength: document.body?.innerText?.length ?? 0
    };
  });

  const screenshotPath = resolve(artifacts, `${target.name}-${runStamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  results.push({
    target: target.name,
    url: target.url,
    viewport: target.viewport,
    screenshotPath,
    metrics
  });

  await context.close();
}

await browser.close();

const reportPath = resolve(artifacts, `ui-audit-${runStamp}.json`);
writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");

console.log(`UI audit written to ${reportPath}`);
