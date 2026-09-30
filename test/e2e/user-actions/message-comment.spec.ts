import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, findIdBy, loginAdmin } from "../_admin";

// 留言板评论(contentId 来自后台设置;未配置时页面显示提示 → skip)
test("留言板提交留言", async ({ page }) => {
  test.setTimeout(90_000);
  const marker = `e2e-message-${Date.now()}`;

  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG); // 登录态免图形验证码
  await page.goto("/messages");

  // 未配置留言板 → 页面显示提示,无输入框(等 5s 排除渲染时序误判)
  const box = page.getByRole("textbox", { name: /评论内容|留言/ }).first();
  const visible = await box.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
  if (!visible) {
    test.skip(true, "留言板未配置(后台无 contentId)");
  }
  await page.waitForTimeout(5200);
  await box.click();
  await box.fill(marker);
  await page.getByRole("button", { name: /提交评论|留言/ }).last().click();
  await expect(page.getByText("评论提交成功")).toBeVisible({ timeout: 15_000 });

  try {
    const list = await (await page.request.get("/api/admin/comments?page=1&pageSize=50")).json();
    const coid = findIdBy(list, o => o.content === marker, "coid");
    if (coid !== null) await adminDelete(page.request, `/api/admin/comments/${coid}`);
  } catch (err) {
    console.warn("[e2e] 留言清理失败(残留 marker):", marker, err);
  }
});
