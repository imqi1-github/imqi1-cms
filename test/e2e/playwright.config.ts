import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// 复用常驻 dev(约定 localhost:3001,绑 [::1]);无服务时以 PORT 自启 bun run dev
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.env.E2E_PORT || 3001);
const baseURL = `http://localhost:${PORT}`;
// E2E_SMOKE=1 只跑 smoke/(第三方真服务探活),默认排除
const SMOKE = !!process.env.E2E_SMOKE;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: SMOKE ? [/smoke[/\\].*\.spec\.ts/] : undefined,
  testIgnore: SMOKE ? [] : [/smoke[/\\]/],
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    cwd: ROOT,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { ...process.env, PORT: String(PORT) },
  },
});
