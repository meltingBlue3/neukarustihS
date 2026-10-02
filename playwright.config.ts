import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 35000,
  use: {
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
