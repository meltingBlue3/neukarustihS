import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Every test plays real audio. Playwright's default of one worker per two
  // CPU threads runs so many browsers at once that songs stall for seconds.
  workers: 4,
  timeout: 35000,
  use: {
    // Exercise the supported browser, including native directory permissions.
    // PLAYWRIGHT_CHANNEL can select another installed channel for comparison.
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    baseURL: "http://127.0.0.1:4173/neukarustihS/",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/neukarustihS/",
    reuseExistingServer: true,
  },
});
