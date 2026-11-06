import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, ADMIN_PASS, ADMIN_USER, loginAdmin } from "../_admin";

// 登录页 UI 全流程:表单填写 → 提交 → 跳转后台;注意会踢掉现有 admin 会话
// 凭据预检必须用**独立的 request fixture**:page.request 与浏览器 context 共享 cookie,
// 预检登录的会话会让 /login 一打开就被 verify 判为已登录并弹到 /admin,表单永不渲染
test("登录页表单登录并跳转后台", async ({ page, request }) => {
  test.setTimeout(180_000); // 自愈路径含 61s 限流等待
  test.skip(!(await loginAdmin(request)), ADMIN_SKIP_MSG);
  await page.goto("/login");

  await page.fill("#username", ADMIN_USER);
  await page.fill("#password", ADMIN_PASS);
  await page.getByRole("button", { name: "登录", exact: true }).click();

  // 登录成功 → navigateTo(redirectTo),默认进 /admin
  await page.waitForURL(/\/admin/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
});

// 登出闭环:后台点退出登录 → 回登录页
test("后台登出回到登录页", async ({ page, request }) => {
  test.setTimeout(180_000); // 自愈路径含 61s 限流等待
  test.skip(!(await loginAdmin(request)), ADMIN_SKIP_MSG);
  await page.goto("/login");

  await page.fill("#username", ADMIN_USER);
  await page.fill("#password", ADMIN_PASS);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/admin/, { timeout: 15_000 });

  // AdminLayout 顶栏退出按钮(已补 aria-label)
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page.locator("#username")).toBeVisible({ timeout: 10_000 });
});
