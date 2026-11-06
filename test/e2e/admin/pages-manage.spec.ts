import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, loginAdmin } from "../_admin";

// 页面管理:新建页面 → 编辑器输入 → 「页面设置」tab 填标题 → 保存 → toast + 跳转 → 清理
// 页面 slug 是类型下拉(留言板/协议/自定义):预设 slug(messages/agreement)在库里已存在,
// 直接保存会 400「Slug 已被其他文章使用」→ 选「自定义」填唯一 slug(前台 404 不影响本用例)
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

  // slug 选「自定义」并填唯一值,避开预设 slug 的唯一性冲突
  const slugSelect = page.getByRole("combobox", { name: "页面 Slug" });
  await expect(slugSelect).toBeVisible({ timeout: 10_000 });
  await slugSelect.click();
  await page.getByRole("option", { name: "自定义" }).click();
  const customSlugInput = page.getByPlaceholder("输入自定义 slug，如 about");
  await expect(customSlugInput).toBeVisible({ timeout: 10_000 });
  await customSlugInput.fill(marker);

  await page.getByRole("button", { name: /保存页面|保存文章|保存$/ }).click();
  // 页面管理编辑器的成功文案是「页面已创建 / 页面已更新」；
  // 不能用宽正则（含「已保存」）——编辑器状态栏也有「已保存 HH:mm」，会撞成 strict mode violation
  await expect(page.getByText("页面已创建", { exact: true })).toBeVisible({ timeout: 20_000 });

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
