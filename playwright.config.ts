import { defineConfig } from "@playwright/test";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const HEADED = ENV.PW_HEADED === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    headless: !HEADED,
    viewport: HEADED ? null : { width: 1280, height: 720 },
    launchOptions: {
      slowMo: ENV.PW_SLOWMO ? parseInt(ENV.PW_SLOWMO, 10) : 0,
      args: HEADED ? ["--kiosk", "--start-fullscreen", "--window-position=0,0"] : [],
    },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
      testIgnore: "**/ios-webkit.spec.ts",
    },
    {
      name: "ios-webkit",
      use: {
        browserName: "webkit",
        viewport: { width: 834, height: 1194 },
        hasTouch: true,
        isMobile: true,
      },
      testMatch: "**/ios-webkit.spec.ts",
    },
  ],
  webServer: {
    command: "npm run dev:all",
    url: "http://localhost:4000/health",
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
