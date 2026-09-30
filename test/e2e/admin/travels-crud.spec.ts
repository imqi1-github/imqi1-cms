import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, findIdBy, loginAdmin } from "../_admin";

// 旅行地点增改删:添加地点弹窗直接填经纬度数值(不碰地图选点) → 编辑改名 → 删除
// 行内按钮无可达名(pencil/trash 纯图标) → 按索引定位:0=启用toggle 1=编辑 2=删除
test("旅行地点增改删", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-travel-${Date.now()}`;

  await page.goto("/admin/travels");

  // 打开添加地点弹窗
  await expect(async () => {
    await page.getByRole("button", { name: "添加地点" }).click();
    await expect(page.locator("#travelName")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.fill("#travelName", marker);
  await page.fill("#travelLng", "123.4");
  await page.fill("#travelLat", "41.8");
  await page.getByRole("button", { name: "确定" }).last().click();
  await expect(page.getByText("添加成功")).toBeVisible({ timeout: 10_000 });

  const row = page.getByRole("row", { name: new RegExp(marker) });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // 编辑(弹窗):改名保存
  await row.getByRole("button").nth(1).click();
  const editName = page.locator("#editTravelName");
  await expect(editName).toBeVisible({ timeout: 10_000 });
  const renamed = `${marker}-r`;
  await editName.fill(renamed);
  await page.getByRole("button", { name: /保存|确定/ }).last().click();
  await expect(page.getByText("更新成功")).toBeVisible({ timeout: 10_000 });

  // 删除(行按钮 nth(2))
  const renamedRow = page.getByRole("row", { name: new RegExp(renamed) });
  await expect(renamedRow).toBeVisible({ timeout: 10_000 });
  await renamedRow.getByRole("button").nth(2).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText(/删除成功|已删除/)).toBeVisible({ timeout: 10_000 });

  // 兜底 API 清理
  const list = await (await page.request.get("/api/admin/travels")).json();
  const id = findIdBy(list, o => o.name === renamed || o.name === marker, "id");
  if (id !== null) await adminDelete(page.request, `/api/admin/travels/${id}`).catch(() => undefined);
});
