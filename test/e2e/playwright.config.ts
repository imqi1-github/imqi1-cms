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
    // 自启前清掉陈旧 lock(dev 被上次测试进程强杀后残留,pid 复用会让 Nuxt 误判 dev 已在跑);
    // 仅在无服务可复用时才会执行,不会碰用户手动常驻的 dev;
    // 删除走 bun -e rmSync 跨平台(playwright 在 Windows 用 cmd,没有 rm)
    command: 'bun -e "require(\'node:fs\').rmSync(\'.nuxt/nuxt.lock\',{force:true})" && bun run dev',
    url: baseURL,
    cwd: ROOT,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { ...process.env, PORT: String(PORT) },
  },
});
