import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    headless: process.env.PW_HEADED !== "1",
    launchOptions: {
      slowMo: process.env.PW_SLOWMO ? parseInt(process.env.PW_SLOWMO, 10) : 0,
    },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:all",
    url: "http://localhost:4000/health",
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
