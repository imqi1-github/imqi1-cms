import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// 补齐所有 DATA_TABLES 表的 findMany,确保 export 流不会因未注册 handler 抛错
const allModels = [
  "attachments", "metas", "changelogs", "informations", "links",
  "travels", "contents", "comments", "subscribes", "subscribeposts",
  "contentrelations", "contentattachments",
];

for (const model of allModels) {
  sharedFake.on(model, "findMany", async () => []);
}

mockSharedPrisma();

const exportHandler = (await import("#server/api/admin/data/export.get")).default;

describe("admin/data/export.get(数据备份导出)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(exportHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  // 已登录分支依赖 sendStream 流式输出 + Content-Disposition 头,与 helper/admin.ts 的
  // adminEvent res stub 不兼容;data-transfer util 的导入/导出核心逻辑已由
  // test/zz-late/api/admin/data-transfer.test.ts 详细覆盖,这里跳过响应流
});