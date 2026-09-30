import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, loginAdmin } from "../_admin";

// 账户设置(不改密码):改昵称 → 保存 → toast → 恢复原值 → 再保存
test("修改昵称并恢复", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);

  // 原值:/api/auth/me 拿 uid → /api/admin/users/{uid} 拿详情
  const me = (await (await page.request.get("/api/auth/me")).json()) as { data?: { uid?: number }; uid?: number };
  const uid = me?.data?.uid ?? me?.uid;
  test.skip(!uid, "无法获取 uid");
  const detail = (await (await page.request.get(`/api/admin/users/${uid}`)).json()) as { data?: { nickname?: string } };
  const original = (detail?.data?.nickname ?? "") as string;

  await page.goto("/admin/users");
  const nickname = page.locator("#userNickname");
  await expect(nickname).toBeVisible({ timeout: 15_000 });

  const marker = `e2e-nick-${Date.now()}`;
  await nickname.fill(marker);
  await page.getByRole("button", { name: "保存", exact: true }).first().click();
  await expect(page.getByText("账户更新成功")).toBeVisible({ timeout: 10_000 });

  // 恢复原昵称
  await nickname.fill(original);
  await page.getByRole("button", { name: "保存", exact: true }).first().click();
  await expect(page.getByText("账户更新成功")).toBeVisible({ timeout: 10_000 });
  await expect(nickname).toHaveValue(original);
});
