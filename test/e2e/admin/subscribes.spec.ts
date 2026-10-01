import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, findIdBy, loginAdmin } from "../_admin";

// 订阅列表:添加订阅源(指向本站 /feed)→ 列表出现 → API 删除
// 注:SSRF 防护按设计拦截内网 URL,本地 feed 实际抓取会被拒 → 只断言 CRUD,不断言抓取结果
// 行内删除入口为下拉/图标无稳定可达名 → 删除走 API 兜底
test("订阅源添加与删除", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-sub-${Date.now()}`;

  await page.goto("/admin/subscribes");

  // 打开添加表单:空状态「添加第一个订阅」/ 有订阅「添加订阅」;hydration 竞态 → toPass 重试
  await expect(async () => {
    const opener = page.getByRole("button", { name: "添加第一个订阅" }).or(page.getByRole("button", { name: "添加订阅" })).first();
    await opener.click();
    await expect(page.getByPlaceholder("订阅名称")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const nameInput = page.getByPlaceholder("订阅名称");
  await expect(nameInput).toBeVisible({ timeout: 10_000 });
  await nameInput.fill(marker);
  await page.getByPlaceholder("RSS URL").first().fill(`http://localhost:${process.env.E2E_PORT ?? "3001"}/feed`);
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("添加成功")).toBeVisible({ timeout: 10_000 });

  const row = page.getByRole("row", { name: new RegExp(marker) });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // API 删除清理(行内删除入口无稳定可达名) → reload 验证列表已移除
  const list = await (await page.request.get("/api/admin/subscribes?page=1&pageSize=100")).json();
  const id = findIdBy(list, o => o.name === marker, "id");
  expect(id).not.toBeNull();
  await adminDelete(page.request, `/api/admin/subscribes/${id}`);
  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(marker) })).not.toBeVisible({ timeout: 10_000 });
});
