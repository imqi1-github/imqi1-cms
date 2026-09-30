import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, cleanupArticle, ensureArticle, findFirstArticle, findIdBy, loginAdmin } from "../_admin";

// 嵌套回复全链路:UI 发父评论 → 点回复 → 回复框提交 → 断言嵌套 → 清理父+子
// 回复按钮无文本(v-tooltip),按 icon class 子串定位;回复框与主框共存,输入/按钮取 last()
test("回复已有评论形成嵌套", async ({ page }) => {
  test.setTimeout(120_000); // 两次提交各等 5s 反垃圾窗 + 造数据清理
  const parentMarker = `e2e-parent-${Date.now()}`;
  const replyMarker = `e2e-reply-${Date.now()}`;

  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const archiving = await (await page.request.get("/api/archiving")).json();
  const found = findFirstArticle(archiving);
  const art = found ? null : await ensureArticle(page.request);
  test.skip(!found && !art, ADMIN_SKIP_MSG);
  const article = found ?? { category: art!.category, slug: art!.slug, title: art!.title };

  await page.goto(`/content/${article.category}/${article.slug}`);

  // 诊断:打印评论提交的真实响应(状态码 + body 前 200 字)
  page.on("response", async res => {
    if (res.url().includes("/api/comments") && res.request().method() === "POST") {
      console.log("[e2e] POST /api/comments ->", res.status(), JSON.stringify(await res.json()).slice(0, 300));
    }
  });

  // 发父评论
  const mainBox = page.getByRole("textbox", { name: /评论内容/ }).first();
  await expect(mainBox).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(5200);
  await mainBox.click();
  await mainBox.fill(parentMarker);
  await page.getByRole("button", { name: "提交评论" }).click();
  await expect(page.getByText("评论提交成功")).toBeVisible({ timeout: 15_000 });

  try {
    // 等列表刷新出父评论,点它的回复按钮(comment item 最外层容器含按钮与嵌套回复)
    const parentItem = page.locator("li, article").filter({ hasText: parentMarker }).first();
    await expect(parentItem).toBeVisible({ timeout: 10_000 });
    await parentItem.locator("button").filter({ has: page.locator("[class*='reply-fill']") }).first().click();

    // 回复框与主评论框共存 → 取 last();Enter 不提交(仅 undo 快捷键),必须点按钮
    const replyBox = page.getByRole("textbox", { name: /评论内容|回复/ }).last();
    await expect(replyBox).toBeVisible({ timeout: 10_000 });
    // 服务端按 IP+DB 时间限 60s 间隔(429),localStorage 伪造骗不过,只能真等
    await page.waitForTimeout(61_000);
    await replyBox.click();
    await replyBox.fill(replyMarker);
    await page.getByRole("button", { name: "提交评论" }).last().click();
    await expect(page.getByText("评论提交成功")).toBeVisible({ timeout: 15_000 });

    // 嵌套断言:回复内容出现在父评论项内部
    await expect(parentItem.getByText(replyMarker)).toBeVisible({ timeout: 10_000 });
  } finally {
    // 无条件清理:先删子再删父(找不到自然跳过)
    try {
      const list = await (await page.request.get("/api/admin/comments?page=1&pageSize=50")).json();
      for (const marker of [replyMarker, parentMarker]) {
        const coid = findIdBy(list, o => o.content === marker, "coid");
        if (coid !== null) await adminDelete(page.request, `/api/admin/comments/${coid}`);
      }
    } catch (err) {
      console.warn("[e2e] 评论清理失败:", err);
    }
    if (art) await cleanupArticle(page.request, art);
  }
});
