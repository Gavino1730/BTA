import { isJwtAuthEnabled } from "./auth.js";
import {
  assertRuntimeConfig,
  formatValidationReport,
  readRuntimeConfig,
  validateRuntimeConfig
} from "./config-validation.js";

function run(): void {
  const config = readRuntimeConfig(isJwtAuthEnabled());
  const result = validateRuntimeConfig(config);
  const report = formatValidationReport(result);

  if (report) {
    console.log(report);
  } else {
    console.log("[OK] Runtime configuration validation passed.");
  }

  assertRuntimeConfig(config);
}

run();
