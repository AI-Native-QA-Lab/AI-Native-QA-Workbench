import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const fixtureTemplate = resolve("tests/fixtures/golden-path/project");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : {}),
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: `node tests/e2e/start-server.mjs ${JSON.stringify(fixtureTemplate)}`,
      url: "http://127.0.0.1:4317/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @ai-native-qa-workbench/web dev --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
