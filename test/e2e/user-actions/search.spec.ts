import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, cleanupArticle, ensureArticle, findFirstArticle, loginAdmin } from "../_admin";

// 搜索页(URL 直达 /search?q=)命中既有文章标题;搜索只读,自造的文章跑完即清
test("搜索命中既有文章", async ({ page }) => {
  test.setTimeout(90_000); // 可能自造文章+清理,超默认 30s
  const archiving = await (await page.request.get("/api/archiving")).json();
  const found = findFirstArticle(archiving);
  const art = found ? null : await ensureArticle(page.request);
  test.skip(!found && !art, ADMIN_SKIP_MSG);
  const article = found ?? { title: art!.title };

  const kw = (article.title || "e2e").slice(0, 2);
  test.skip(kw.length < 2, "标题过短无法截取关键词");

  try {
    await page.goto(`/search?q=${encodeURIComponent(kw)}`);
    // 页内真实计数文案(非 document.title);防抖 300ms 后出结果
    await expect(page.getByText(/找到 \d+ 篇相关文章/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(article.title).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    if (art) await cleanupArticle(page.request, art);
  }
});

// 输入即搜:fill 后 300ms 防抖自动触发,无需回车
test("搜索框输入即搜", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const archiving = await (await page.request.get("/api/archiving")).json();
  const found = findFirstArticle(archiving);
  const art = found ? null : await ensureArticle(page.request);
  test.skip(!found && !art, ADMIN_SKIP_MSG);
  const article = found ?? { title: art!.title };

  const kw = (article.title || "e2e").slice(0, 2);
  test.skip(kw.length < 2, "标题过短无法截取关键词");

  try {
    await page.goto("/search");
    const input = page.getByRole("textbox", { name: /搜索/ }).first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(kw);
    await expect(page.getByText(/找到 \d+ 篇相关文章/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(article.title).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    if (art) await cleanupArticle(page.request, art);
  }
});
