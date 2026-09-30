import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, loginAdmin } from "../_admin";

// 页面管理:新建页面 → 编辑器输入 → 「页面设置」tab 填标题 → 保存 → toast + 跳转 → 清理
// 页面 slug 是类型下拉(about/agreement/custom),不走自由输入
test("新建页面并保存", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-page-${Date.now()}`;

  await page.goto("/admin/pages/edit");
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await editor.fill(`${marker} 正文`);

  await page.getByRole("tab", { name: /页面设置/ }).click();
  const titleInput = page.locator("#page-title");
  await expect(titleInput).toBeVisible({ timeout: 10_000 });
  await page.fill("#page-title", marker);

  await page.getByRole("button", { name: /保存页面|保存文章|保存$/ }).click();
  await expect(page.getByText(/创建成功|更新成功|已保存/)).toBeVisible({ timeout: 20_000 });

  // 清理:优先 URL cid,否则列表按标题匹配
  const cidFromUrl = page.url().match(/cid=(\d+)/)?.[1];
  if (cidFromUrl) {
    await adminDelete(page.request, `/api/admin/contents/${cidFromUrl}`);
  } else {
    const list = await (await page.request.get("/api/admin/contents?page=1&pageSize=50")).json();
    const cid = JSON.stringify(list).match(new RegExp(`"cid":(\\d+)[^}]*"title":"${marker}"`))?.[1];
    if (cid) await adminDelete(page.request, `/api/admin/contents/${cid}`);
  }
});
