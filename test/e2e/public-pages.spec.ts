import { expect, test } from "@playwright/test";

// 公开页面可达性:真实 dev server + 真 DB,回归路由/SSR/渲染
const pages = ["/", "/archiving", "/links", "/about", "/changelogs", "/messages"];

test.describe("公开页面", () => {
  for (const path of pages) {
    test(`${path} 可达且渲染 h1`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    });
  }

  // agreement 内容存 CMS(dev DB 未建该页 → 404 合法;线上已建 → 200)
  test("/agreement 200(已建)或 404(未建)均合法", async ({ page }) => {
    const res = await page.goto("/agreement");
    expect([200, 404]).toContain(res?.status());
  });
});
