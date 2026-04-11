import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RUNTIME_FILES = [
  "server.ts",
  "store.ts",
  "persistence.ts",
  "config-validation.ts",
  "auth.ts",
  "tenant-guards.ts",
];

describe("logging guard", () => {
  it("does not allow direct console usage in core runtime modules", () => {
    for (const fileName of RUNTIME_FILES) {
      const filePath = resolve(__dirname, fileName);
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toMatch(/\bconsole\.(log|warn|error|debug)\b/);
    }
  });
});
