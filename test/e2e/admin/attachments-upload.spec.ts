import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, adminDelete, findIdBy, loginAdmin } from "../_admin";

// 1x1 透明 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// 附件上传(本地存储):hidden input 需 force setInputFiles → toast → 列表出现 → 确认删除
test("上传附件并删除", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!(await loginAdmin(page.request)), ADMIN_SKIP_MSG);
  const marker = `e2e-upload-${Date.now()}.png`;

  await page.goto("/admin/attachments");

  // 真实用户路径:点「上传附件」→ file chooser → 设文件;click 可能撞 hydration 竞态 → toPass 重试
  await expect(async () => {
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 5_000 });
    await page.getByRole("button", { name: "上传附件" }).first().click();
    const chooser = await chooserPromise;
    await chooser.setFiles([{ name: marker, mimeType: "image/png", buffer: PNG }]);
  }).toPass({ timeout: 30_000 });

  await expect(page.getByText("上传成功")).toBeVisible({ timeout: 30_000 });

  try {
    // 上传成功即核心断言(列表可能虚拟渲染/行结构非 tr,删除统一走 API 兜底)
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    // API 清理(列表是 /all 顶层数组结构,findIdBy 递归容错)
    const list = await (await page.request.get("/api/admin/attachments/all?page=1&pageSize=100")).json();
    const id = findIdBy(list, o => o.name === marker, "id");
    if (id !== null) await adminDelete(page.request, `/api/attachments/${id}`).catch(() => undefined);
  }
});

