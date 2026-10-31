import { defineConfig } from "@playwright/test";
const externalURL = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: externalURL || "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
  },
  reporter: "list",
  webServer: externalURL
    ? undefined
    : [
        {
          command: ".venv/bin/python -m backend.app",
          cwd: "..",
          url: "http://127.0.0.1:5001/api/health",
          reuseExistingServer: true,
        },
        {
          command: "npm run dev",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: true,
        },
      ],
});
