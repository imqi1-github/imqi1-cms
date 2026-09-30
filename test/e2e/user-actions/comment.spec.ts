import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, cleanupArticle, ensureArticle, findFirstArticle, findIdBy, loginAdmin } from "../_admin";

// 登录态评论全链路:填表→提交→成功提示→清理(写 dev DB,提交后必须清)
// 评论框是 EmojiRichInput(contenteditable),用 role 定位;登录态绕开访客图形验证码
// 全程只用 page.request 单次登录(单端登录会踢掉更早的会话,多次登录会让清理 API 401)
test("登录后提交评论并出现成功提示", async ({ page }) => {
  test.setTimeout(90_000); // 造数据+5s 反垃圾窗+清理,超默认 30s
  const marker = `e2e-comment-${Date.now()}`;
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const archiving = await (await page.request.get("/api/archiving")).json();
  const found = findFirstArticle(archiving);
  const art = found ? null : await ensureArticle(page.request);
  test.skip(!found && !art, ADMIN_SKIP_MSG);
  const article = found ?? { category: art!.category, slug: art!.slug, title: art!.title };

  await page.goto(`/content/${article.category}/${article.slug}`);

  const box = page.getByRole("textbox", { name: /评论内容/ });
  await expect(box).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(5200); // 反垃圾:页面加载 5s 内提交会被拒
  await box.click();
  await box.fill(marker);

  try {
    await page.getByRole("button", { name: "提交评论" }).click();
    await expect(page.getByText("评论提交成功")).toBeVisible({ timeout: 15_000 });
  } finally {
    {
      // 清理测试评论(admin 列表递归找 marker → DELETE);清理失败不影响断言结果
      try {
        const list = await (await page.request.get("/api/admin/comments?page=1&pageSize=50")).json();
        const coid = findIdBy(list, o => o.content === marker, "coid");
        if (coid !== null) await adminDelete(page.request, `/api/admin/comments/${coid}`);
      } catch (err) {
        console.warn("[e2e] 评论清理失败(残留 marker):", marker, err);
      }
    }
    if (art) await cleanupArticle(page.request, art);
  }
});
