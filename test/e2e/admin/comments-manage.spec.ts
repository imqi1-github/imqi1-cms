import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, cleanupArticle, ensureArticle, loginAdmin, postComment } from "../_admin";

// 评论管理:UI 造文章+评论 → 后台列表可见 → 全选+批量删除 → 确认弹窗 → 服务端 toast
// 评论列表不是 table(无 row role),删除走全选+批量删除,不依赖行容器定位
test("后台删除评论", async ({ page }) => {
  test.setTimeout(180_000); // 可能含 429 等待(60s 间隔)
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-admin-cmt-${Date.now()}`;

  const art = await ensureArticle(page.request);
  test.skip(!art, ADMIN_SKIP_MSG);
  const created = await postComment(page.request, { cid: art!.cid, content: marker });

  try {
    await page.goto("/admin/comments");

    // 列表加载完成以计数文案为准(marker 在行内出现多处且有隐藏副本,不作锚点)
    await expect(page.getByText(/共 \d+ 条评论/)).toBeVisible({ timeout: 10_000 });
    expect(created.code).toBe(200);

    // 全选 → 批量删除 → 确认弹窗
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: /删除选中/ }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    // 批量删除 toast 文案来自服务端(成功删除 N 条) — 服务端确认即删除完成的证据
    await expect(page.getByText(/成功删除 \d+ 条评论/)).toBeVisible({ timeout: 10_000 });
  } finally {
    await cleanupArticle(page.request, art!);
  }
});
