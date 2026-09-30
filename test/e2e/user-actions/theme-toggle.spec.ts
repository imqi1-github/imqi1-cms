import { expect, test } from "@playwright/test";

// 暗色/亮色切换(@nuxtjs/color-mode):点击页脚切换按钮断言 html class 翻转;纯前端无写入
test("主题切换翻转 html class", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  const before = (await html.getAttribute("class")) ?? "";
  const toggle = page.getByRole("button", { name: /当前为(亮|暗)色模式/ });
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect(async () => {
    const after = (await html.getAttribute("class")) ?? "";
    expect(after.includes("dark")).not.toBe(before.includes("dark"));
  }).toPass({ timeout: 5_000 });
});
