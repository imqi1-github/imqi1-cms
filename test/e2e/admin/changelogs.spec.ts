import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, findIdBy, loginAdmin } from "../_admin";

// 更新日志:页面内表单(默认 1 行)填内容 → 「添加」提交(非"保存",那是编辑弹窗按钮) → API 恢复
// "新增"是条目类型选项不是动作按钮
test("更新日志新增条目并保存", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-log-${Date.now()}`;

  await page.goto("/admin/changelogs");

  const box = page.getByRole("textbox").first();
  await expect(box).toBeVisible({ timeout: 15_000 });
  await box.fill(marker);
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("添加成功")).toBeVisible({ timeout: 10_000 });

  // API 恢复:删掉刚加的条目(value 嵌在 content[] 里,用 JSON 包含匹配)
  try {
    const list = await (await page.request.get("/api/admin/changelogs")).json();
    const id = findIdBy(list, o => JSON.stringify(o).includes(marker), "id");
    if (id !== null) await adminDelete(page.request, `/api/admin/changelogs/${id}`);
  } catch (err) {
    console.warn("[e2e] changelog 恢复失败(残留 marker):", marker, err);
  }
});
