import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, loginAdmin } from "../_admin";

// 编辑器保存流:新建文章 → 正文(默认富文本 tab) → 「文章设置」tab 填标题/slug/分类 → 保存 → toast + 跳转 → 清理
// 保存入口是侧栏"保存文章"按钮(Ctrl+S/自动保存同链路);Tiptap 编辑区是 .ProseMirror contenteditable
test("新建文章并保存", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-post-${Date.now()}`;

  await page.goto("/admin/contents/edit");
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await editor.fill(`# ${marker}\n\nE2E 临时正文`);

  // #title/#slug/分类都在「文章设置」tab(默认 content tab 时隐藏)
  await page.getByRole("tab", { name: /文章设置|设置/ }).click();
  await expect(page.locator("#title")).toBeVisible({ timeout: 10_000 });
  await page.fill("#title", marker);
  await page.fill("#slug", marker);
  // 分类必选(保存校验"至少需要选择一个分类"),勾第一个分类
  await page.locator("[id^='category-']").first().check();

  await page.getByRole("button", { name: "保存文章" }).click();
  await expect(page.getByText("文章创建成功")).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\/admin\/contents\/edit\?cid=\d+/, { timeout: 15_000 });

  // 清理:从 URL 提取 cid
  const cid = Number(page.url().match(/cid=(\d+)/)?.[1]);
  if (Number.isInteger(cid) && cid > 0) {
    await adminDelete(page.request, `/api/admin/contents/${cid}`);
  }
});
