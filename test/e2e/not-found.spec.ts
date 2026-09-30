import { expect, test } from "@playwright/test";

// 回归 frontend-soft404-setstatus:动态路由不存在的资源必须真 404,不能 SSR 200 软 404
test.describe("404 行为", () => {
  test("不存在的静态路由 → 404", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist-e2e-12345");
    expect(res?.status()).toBeGreaterThanOrEqual(400);
  });

  test("不存在的分类路由 → 404", async ({ page }) => {
    const res = await page.goto("/category/no-such-category-e2e-12345");
    expect(res?.status()).toBe(404);
  });
});
