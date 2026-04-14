#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["apps", "services", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const enforceEnv = process.env.BTA_ENFORCE_NO_SILENT_CATCH;
const ENFORCE = enforceEnv === "1" || (process.env.CI === "true" && enforceEnv !== "0");

function isIgnoredPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/node_modules/") || normalized.includes("/dist/") || normalized.includes("/test-results/")) {
    return true;
  }
  return false;
}

function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return normalized.includes(".test.") || normalized.includes(".spec.");
}

function walk(dirPath, output) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (isIgnoredPath(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(fullPath, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension)) {
      continue;
    }

    if (isTestFile(fullPath)) {
      continue;
    }

    output.push(fullPath);
  }
}

function lineNumberFromIndex(content, index) {
  let lines = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

function collectFindings(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const findings = [];

  const emptyCatchRegex = /catch\s*\{\s*\}/g;
  for (const match of content.matchAll(emptyCatchRegex)) {
    const index = match.index ?? 0;
    findings.push({
      kind: "empty-catch",
      line: lineNumberFromIndex(content, index),
      snippet: "catch {}",
    });
  }

  const emptyPromiseCatchRegex = /\.catch\s*\(\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*\{\s*\}\s*\)/g;
  for (const match of content.matchAll(emptyPromiseCatchRegex)) {
    const index = match.index ?? 0;
    findings.push({
      kind: "empty-promise-catch",
      line: lineNumberFromIndex(content, index),
      snippet: ".catch(() => {})",
    });
  }

  return findings;
}

const files = [];
for (const relativeDir of TARGET_DIRS) {
  walk(path.join(ROOT, relativeDir), files);
}

const allFindings = [];
for (const filePath of files) {
  const findings = collectFindings(filePath);
  if (findings.length === 0) continue;

  for (const finding of findings) {
    allFindings.push({ filePath, ...finding });
  }
}

if (allFindings.length === 0) {
  console.log("[check-silent-errors] No empty catch handlers found.");
  process.exit(0);
}

console.log(`[check-silent-errors] Found ${allFindings.length} empty catch handlers.`);
for (const finding of allFindings) {
  const relative = path.relative(ROOT, finding.filePath).replace(/\\/g, "/");
  console.log(`- ${relative}:${finding.line} [${finding.kind}] ${finding.snippet}`);
}

if (ENFORCE) {
  console.error("[check-silent-errors] Enforcement enabled. Failing due to empty catch handlers.");
  process.exit(1);
}

console.log("[check-silent-errors] Report-only mode (set BTA_ENFORCE_NO_SILENT_CATCH=1 to enforce locally, or 0 to disable enforcement in CI).\n");
process.exit(0);
