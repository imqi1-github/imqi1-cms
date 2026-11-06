import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, findIdBy, getCsrfToken, loginAdmin } from "../_admin";

// 友链审核闭环:造待审友链 → 后台「启用」= 通过上架 → 前台 /links 出现 → 清理
// 造数据走后台接口(不占公开 /api/links 的每小时 3 次限流额度):
// 后台建(默认上架)→ 立即 toggle 成待审 → 再在 UI 点「启用」验证上架闭环
test("友链审核启用并前台可见", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-linkrev-${Date.now()}`;

  const csrf = await getCsrfToken(page.request);
  const create = await page.request.post("/api/admin/links", {
    data: { name: marker, link: "https://example.com", csrfToken: csrf },
  });
  const created = (await create.json()) as { id?: number };
  expect(created.id).toBeGreaterThan(0);

  // 置为待审（enabled=false），与游客申请入库的状态一致
  const toggle = await page.request.patch(`/api/admin/links/${created.id}/toggle`, {
    data: { csrfToken: csrf },
  });
  expect(toggle.status()).toBe(200);

  try {
    await page.goto("/admin/links");
    const row = page.getByRole("row", { name: new RegExp(marker) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // 「启用」= 审核通过上架
    await row.getByRole("button", { name: "启用" }).click();
    await expect(page.getByText("已启用")).toBeVisible({ timeout: 10_000 });

    // 前台可见
    await page.goto("/links");
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await loginAdmin(page.request); // 前台导航后 request 会话仍在,但补登录保稳
    const list = await (await page.request.get("/api/admin/links?page=1&pageSize=100")).json();
    const id = findIdBy(list, o => o.name === marker, "id");
    if (id !== null) await adminDelete(page.request, `/api/admin/links/${id}`);
  }
});
