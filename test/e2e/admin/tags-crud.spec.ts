import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, loginAdmin } from "../_admin";

// 标签管理 CRUD UI:与分类同构(弹窗新建 → 列表 → 确认删除)
test("标签新建与删除", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-tag-${Date.now()}`;

  await page.goto("/admin/tags");

  await expect(async () => {
    await page.getByRole("button", { name: "新建标签" }).click();
    await expect(page.locator("#name")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.fill("#name", marker);
  await page.fill("#slug", marker);
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.getByText("标签创建成功")).toBeVisible({ timeout: 10_000 });

  const row = page.getByRole("row", { name: new RegExp(marker) });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText("标签删除成功")).toBeVisible({ timeout: 10_000 });
  await expect(row).not.toBeVisible({ timeout: 10_000 });
});
