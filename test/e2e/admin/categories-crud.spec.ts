import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, loginAdmin } from "../_admin";

// 分类管理 CRUD UI:弹窗新建 → 列表出现 → 行内删除(确认弹窗) → 列表消失
test("分类新建与删除", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-cat-${Date.now()}`;

  await page.goto("/admin/categories");

  // 新建弹窗(goto 后立即点会撞 hydration 竞态:事件未绑上 click 被吞 → toPass 重试)
  await expect(async () => {
    await page.getByRole("button", { name: "新建分类" }).click();
    await expect(page.locator("#name")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.fill("#name", marker);
  await page.fill("#slug", marker);
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.getByText("分类创建成功")).toBeVisible({ timeout: 10_000 });

  // 列表出现后行内删除(title="删除" 产生可达名) → 确认弹窗
  const row = page.getByRole("row", { name: new RegExp(marker) });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText("分类删除成功")).toBeVisible({ timeout: 10_000 });
  await expect(row).not.toBeVisible({ timeout: 10_000 });
});
