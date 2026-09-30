import { expect, test } from "@playwright/test";

import { adminDelete, findIdBy, loginAdmin } from "../_admin";

// 游客申请友链全链路:填表→回链检测失败(needRetry)→「仍然提交」→成功提示→admin 清理
test("游客申请友链(检测失败后强制提交)", async ({ page, request }) => {
  test.setTimeout(90_000); // 回链检测/needRetry 等待远超默认 30s
  const marker = `e2e-link-${Date.now()}`;
  await page.goto("/links");

  await page.fill("#link-name", marker);
  await page.fill("#link-url", "https://example.com");
  // 「能看到友情链接的地址」仅后台开启自动审核时显示
  const blogUrl = page.locator("#blog-link-url");
  if (await blogUrl.isVisible().catch(() => false)) {
    await blogUrl.fill("https://example.com/links");
  }

  try {
    await page.getByRole("button", { name: "申请友链" }).click();
    // 双路径竞速:开 linkAutoApprove → example.com 无回链 → needRetry → 点「仍然提交」;
    // 未开启 → 直接入库待审核。toast 4s 自动消失,不能串行等待,必须 or() 竞速
    const toast = page.getByText("申请友链成功");
    const forceBtn = page.getByRole("button", { name: "仍然提交" });
    await expect(toast.or(forceBtn)).toBeVisible({ timeout: 20_000 });
    if (await forceBtn.isVisible()) {
      await forceBtn.click();
      await expect(toast).toBeVisible({ timeout: 20_000 });
    }
  } finally {
    {
      try {
        await loginAdmin(request); // 游客用例,清理前补登录(会踢现有后台会话)
        const list = await (await request.get("/api/admin/links?page=1&pageSize=100")).json();
        const id = findIdBy(list, o => o.name === marker, "id");
        if (id !== null) await adminDelete(request, `/api/admin/links/${id}`);
      } catch (err) {
        console.warn("[e2e] 友链清理失败(残留 marker):", marker, err);
      }
    }
  }
});
