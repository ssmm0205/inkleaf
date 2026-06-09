import { defineConfig, devices } from "@playwright/test";

// E2E lives in /e2e and is run with `npm run test:e2e` (separate from the unit
// suite). It serves the built UI from the Inkleaf web server and verifies the
// live "Claude writes → it appears on the page" loop in a real browser.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:8788",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:8788/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { INKLEAF_DB: "/tmp/inkleaf-e2e.db" },
  },
});
