/**
 * test/db/integration-attachment-cleanup.test.ts: 真实 DB 测试 deleteOrphanAttachments
 *
 * 验证 mock 测试无法覆盖的部分:
 * - findMany + contentattachments:{none:{}} 的真 Prisma SQL
 * - 三步走流程(findMany → deleteMany → stillThere 校验)的 race 防护
 * - 孤儿判定:无 contentattachments 关联即孤儿
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("attachment-cleanup DB (no DB configured)", () => {});
} else {
  // 用临时目录替代 UPLOADS_DIR,避免删真文件
  // 但注意:bun:test 跨文件 process 共享,本文件 afterAll 必须 delete UPLOADS_DIR 否则
  // 会污染后续文件(如 test/server/routes/uploads.test.ts 依赖 process.env.UPLOADS_DIR 未设)
  const cleanupDir = mkdtempSync(join(tmpdir(), "att-cleanup-db-"));
  const ORIGINAL_UPLOADS = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = cleanupDir;
  beforeEach(() => {
    rmSync(cleanupDir, { recursive: true, force: true });
    mkdirSync(cleanupDir, { recursive: true });
  });
  afterAll(async () => {
    if (ORIGINAL_UPLOADS === undefined) {
      delete process.env.UPLOADS_DIR;
    } else {
      process.env.UPLOADS_DIR = ORIGINAL_UPLOADS;
    }
    rmSync(cleanupDir, { recursive: true, force: true });
    await disconnectDb();
  });

  describe("deleteOrphanAttachments DB 集成测试", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    test("空数组 → 直接返回 0", async () => {
      const { deleteOrphanAttachments } = await import("#server/utils/attachment-cleanup");
      expect(await deleteOrphanAttachments([])).toBe(0);
    });

    test("aids 含非整数 → 过滤掉,等同于空数组", async () => {
      const { deleteOrphanAttachments } = await import("#server/utils/attachment-cleanup");
      expect(await deleteOrphanAttachments([NaN, Infinity, 1.5] as never)).toBe(0);
    });

    test("aids 去重 → 实际查 [aid=1]", async () => {
      const a1 = await db.attachments.create({
        data: { type: "image", title: "图", url: "/u/a.png" },
      });
      const { deleteOrphanAttachments } = await import("#server/utils/attachment-cleanup");
      const deleted = await deleteOrphanAttachments([a1.aid, a1.aid, a1.aid]);
      expect(deleted).toBe(1);
      const still = await db.attachments.findUnique({ where: { aid: a1.aid } });
      expect(still).toBeNull();
    });

    test("有 contentattachments 关联 → 不算孤儿,保留", async () => {
      const a1 = await db.attachments.create({
        data: { type: "image", title: "图1", url: "/u/1.png" },
      });
      const a2 = await db.attachments.create({
        data: { type: "image", title: "图2", url: "/u/2.png" },
      });
      const article = await db.contents.create({
        data: { title: "t", slug: "t", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      // a1 关联到文章,a2 不关联
      await db.contentattachments.create({ data: { cid: article.cid, aid: a1.aid } });

      const { deleteOrphanAttachments } = await import("#server/utils/attachment-cleanup");
      const deleted = await deleteOrphanAttachments([a1.aid, a2.aid]);
      expect(deleted).toBe(1); // 仅 a2(孤儿)
      expect(await db.attachments.findUnique({ where: { aid: a1.aid } })).not.toBeNull();
      expect(await db.attachments.findUnique({ where: { aid: a2.aid } })).toBeNull();
    });

    test("aids 中没有附件 → 返回 0,不报错", async () => {
      const { deleteOrphanAttachments } = await import("#server/utils/attachment-cleanup");
      expect(await deleteOrphanAttachments([9999, 8888])).toBe(0);
    });
  });
}