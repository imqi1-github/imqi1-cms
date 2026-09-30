/**
 * test/db/integration-attachment-file.test.ts: attachment + 真文件系统 + 附件元数据
 *
 * 验证:
 * - attachment 元数据写入/读取(类型 + size + format)
 * - contentattachments 关联文章 + 附件
 * - 真文件创建/删除
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("attachment-file DB (no DB configured)", () => {});
} else {
  // 真文件系统临时目录
  const uploadsDir = mkdtempSync(join(tmpdir(), "att-file-db-"));
  beforeEach(() => {
    rmSync(uploadsDir, { recursive: true, force: true });
    mkdirSync(uploadsDir, { recursive: true });
  });
  afterAll(async () => {
    rmSync(uploadsDir, { recursive: true, force: true });
    await disconnectDb();
  });

  describe("attachment-file DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    test("attachment.create + metadata 字段(JSON)", async () => {
      const att = await db.attachments.create({
        data: {
          type: "image",
          title: "测试图.png",
          url: "/uploads/test/abc.png",
          storage: "local",
          metadata: {
            size: 102400,
            width: 1920,
            height: 1080,
            format: "png",
          } as never,
        },
      });
      const got = await db.attachments.findUnique({ where: { aid: att.aid } });
      expect(got).not.toBeNull();
      expect(got?.url).toBe("/uploads/test/abc.png");
      const m = got?.metadata as { size: number; width: number; height: number; format: string };
      expect(m.size).toBe(102400);
      expect(m.width).toBe(1920);
      expect(m.height).toBe(1080);
      expect(m.format).toBe("png");
    });

    test("attachment 关联文章 + contentattachments", async () => {
      const att = await db.attachments.create({
        data: { type: "image", title: "甲.png", url: "/uploads/x.png", storage: "local" },
      });
      const article = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.contentattachments.create({ data: { cid: article.cid, aid: att.aid } });

      // 直接查关联表(更明确)
      const rels = await db.contentattachments.findMany({
        where: { cid: article.cid },
      });
      expect(rels).toHaveLength(1);
      expect(rels[0]?.aid).toBe(att.aid);

      // 查 attachment 拿到完整字段
      const got = await db.attachments.findUnique({ where: { aid: att.aid } });
      expect(got?.title).toBe("甲.png");
    });

    test("attachment 与文件实际存在:createFile + DB 关联", async () => {
      const realPath = join(uploadsDir, "real-file.png");
      writeFileSync(realPath, "fake-png-bytes-12345");

      const att = await db.attachments.create({
        data: {
          type: "image",
          title: "real.png",
          url: `/uploads/${realPath.split("/").pop()}`,
          storage: "local",
        },
      });

      // 文件确实存在
      expect(existsSync(realPath)).toBe(true);
      // DB 关联成功
      expect(att.aid).toBeGreaterThan(0);
      // URL 与文件名匹配
      expect(att.url.endsWith("real-file.png")).toBe(true);
    });

    test("contentattachments 级联:删 article → 自动清关联", async () => {
      const att = await db.attachments.create({
        data: { type: "image", title: "x", url: "/x.jpg", storage: "local" },
      });
      const article = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.contentattachments.create({ data: { cid: article.cid, aid: att.aid } });
      expect(await db.contentattachments.count()).toBe(1);

      // 删文章 → 关联自动清
      await db.contents.delete({ where: { cid: article.cid } });
      expect(await db.contentattachments.count()).toBe(0);
      // 附件本身仍存在(附件不会被级联删)
      expect(await db.attachments.findUnique({ where: { aid: att.aid } })).not.toBeNull();
    });

    test("contentattachments 级联:删 attachment → 自动清关联", async () => {
      const att = await db.attachments.create({
        data: { type: "image", title: "y", url: "/y.jpg", storage: "local" },
      });
      const article = await db.contents.create({
        data: { title: "y", slug: "y", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.contentattachments.create({ data: { cid: article.cid, aid: att.aid } });

      await db.attachments.delete({ where: { aid: att.aid } });
      expect(await db.contentattachments.count()).toBe(0);
      // 文章仍存在
      expect(await db.contents.findUnique({ where: { cid: article.cid } })).not.toBeNull();
    });
  });
}