#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TRACKER_PATH = path.join(ROOT, "improvements", "IMPROVEMENTS.md");
const enforceEnv = process.env.BTA_ENFORCE_CRITICAL_METADATA;
const ENFORCE = enforceEnv === "1" || (process.env.CI === "true" && enforceEnv !== "0");
const MAX_OPEN_P0 = 5;
const MAX_OPEN_P1 = 12;

function lineNumberFromIndex(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

if (!fs.existsSync(TRACKER_PATH)) {
  console.error("[check-critical-backlog] Tracker file not found: improvements/IMPROVEMENTS.md");
  process.exit(ENFORCE ? 1 : 0);
}

const content = fs.readFileSync(TRACKER_PATH, "utf8");

const findings = [];
let openP0Count = 0;
let openP1Count = 0;
const openCriticalRegex = /^-\s*\[(?:\s|!|~)\]\s*P([01])\b.*$/gim;

for (const match of content.matchAll(openCriticalRegex)) {
  const lineText = match[0] ?? "";
  const priority = `P${match[1]}`;
  const index = match.index ?? 0;
  const line = lineNumberFromIndex(content, index);

  if (priority === "P0") {
    openP0Count++;
  } else {
    openP1Count++;
  }

  // Ignore completed items defensively, though regex should already skip [x].
  if (lineText.includes("[x]")) {
    continue;
  }

  // Capture metadata notes under the current list item until the next top-level checklist item.
  const start = index + lineText.length;
  let end = content.length;
  const nextTopLevel = /\n-\s*\[(?:\s|!|~|x)\]\s*P[0-2]\b/gim;
  nextTopLevel.lastIndex = start;
  const nextMatch = nextTopLevel.exec(content);
  if (nextMatch?.index != null) {
    end = nextMatch.index;
  }

  const block = content.slice(start, end);

  const hasOwner = /(?:^|\n)\s*-\s*owner\s*:/i.test(block);
  const hasDueDate = /(?:^|\n)\s*-\s*due(?:\s*date)?\s*:/i.test(block);
  const hasExitCriteria = /(?:^|\n)\s*-\s*exit\s*criteria\s*:/i.test(block);

  const missing = [];
  if (!hasOwner) missing.push("owner");
  if (!hasDueDate) missing.push("due date");
  if (!hasExitCriteria) missing.push("exit criteria");

  // Allow explicit temporary waiver by adding "- metadata waiver: <reason>".
  const hasWaiver = /(?:^|\n)\s*-\s*metadata\s*waiver\s*:/i.test(block);

  if (missing.length > 0 && !hasWaiver) {
    findings.push({
      line,
      priority,
      lineText: lineText.trim(),
      missing,
    });
  }
}

const capFindings = [];
if (openP0Count > MAX_OPEN_P0) {
  capFindings.push({
    priority: "P0",
    count: openP0Count,
    max: MAX_OPEN_P0,
  });
}
if (openP1Count > MAX_OPEN_P1) {
  capFindings.push({
    priority: "P1",
    count: openP1Count,
    max: MAX_OPEN_P1,
  });
}

if (findings.length === 0 && capFindings.length === 0) {
  console.log("[check-critical-backlog] All open P0/P1 items satisfy metadata and WIP-cap checks.");
  process.exit(0);
}

if (findings.length > 0) {
  console.log(`[check-critical-backlog] Found ${findings.length} open P0/P1 items missing required metadata.`);
  for (const finding of findings) {
    console.log(`- improvements/IMPROVEMENTS.md:${finding.line} [${finding.priority}] missing ${finding.missing.join(", ")}`);
    console.log(`  ${finding.lineText}`);
  }
}

if (capFindings.length > 0) {
  console.log("[check-critical-backlog] WIP-cap violations detected.");
  for (const finding of capFindings) {
    console.log(`- ${finding.priority} open count ${finding.count} exceeds max ${finding.max}`);
  }
}

if (ENFORCE) {
  console.error("[check-critical-backlog] Enforcement enabled. Failing due to critical backlog policy violations.");
  process.exit(1);
}

console.log("[check-critical-backlog] Report-only mode (set BTA_ENFORCE_CRITICAL_METADATA=1 to enforce locally, or 0 to disable enforcement in CI).");
process.exit(0);
