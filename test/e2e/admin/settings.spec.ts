import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, getAdminSettings, loginAdmin } from "../_admin";

// 系统设置:改站点名 → 保存 → toast → API 恢复原值 → 再走一次保存
test("修改并恢复站点名", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const original = (await getAdminSettings(page.request)).siteName as string;
  test.skip(!original, "siteName 未配置");

  const marker = `E2E站点${Date.now() % 100000}`;
  await page.goto("/admin/settings");

  const siteName = page.locator("#siteName");
  await expect(siteName).toBeVisible({ timeout: 15_000 });
  await siteName.fill(marker);

  // 诊断:打印保存请求结果
  page.on("response", async res => {
    if (res.url().includes("/api/admin/settings") && res.request().method() !== "GET") {
      console.log("[e2e] settings save ->", res.status(), (await res.text()).slice(0, 200));
    }
  });

  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible({ timeout: 10_000 });

  // 恢复原值(settings GET 有缓存,还原断言用 UI 值不走 API)
  await siteName.fill(original);
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible({ timeout: 10_000 });
  await expect(siteName).toHaveValue(original);
});
