/**
 * test/db/integration-others.test.ts: 真实 DB 测试其他表(informations/attachments/comments/links)
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("misc tables DB (no DB configured)", () => {});
} else {
  describe("misc tables DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("informations(key/value 设置)基本 CRUD", async () => {
      await db.informations.create({
        data: { key: "siteName", value: "我的博客" },
      });
      const got = await db.informations.findUnique({ where: { key: "siteName" } });
      expect(got?.value).toBe("我的博客");

      const updated = await db.informations.update({
        where: { key: "siteName" },
        data: { value: "新名" },
      });
      expect(updated.value).toBe("新名");
    });

    test("informations upsert:已存在则 update,不存在则 create", async () => {
      await db.informations.upsert({
        where: { key: "siteUrl" },
        create: { key: "siteUrl", value: "https://x.com" },
        update: { value: "https://y.com" },
      });
      const first = await db.informations.findUnique({ where: { key: "siteUrl" } });
      expect(first?.value).toBe("https://x.com");

      await db.informations.upsert({
        where: { key: "siteUrl" },
        create: { key: "siteUrl", value: "x" },
        update: { value: "https://y.com" },
      });
      const second = await db.informations.findUnique({ where: { key: "siteUrl" } });
      expect(second?.value).toBe("https://y.com");
    });

    test("attachments.create + metadata JSON 字段", async () => {
      const att = await db.attachments.create({
        data: {
          type: "image",
          title: "图甲",
          url: "/uploads/test.png",
          storage: "local",
          metadata: { size: 1024, width: 800, height: 600, format: "png" },
        },
      });
      expect(att.aid).toBeGreaterThan(0);
      expect(att.metadata).toMatchObject({ format: "png" });
    });

    test("comments 级联删除:删文章 → 清评论", async () => {
      const article = await db.contents.create({
        data: {
          title: "t",
          slug: "t",
          status: 1,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });
      await db.comments.create({
        data: {
          cid: article.cid,
          name: "n",
          mail: "n@x.com",
          content: "c",
          status: 1,
        },
      });
      expect(await db.comments.count()).toBe(1);
      await db.contents.delete({ where: { cid: article.cid } });
      expect(await db.comments.count()).toBe(0);
    });

    test("comments.parent_id 自引用 + 嵌套查询", async () => {
      const article = await db.contents.create({
        data: {
          title: "t",
          slug: "t",
          status: 1,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });
      const parent = await db.comments.create({
        data: {
          cid: article.cid,
          name: "父",
          content: "父评论",
          status: 1,
        },
      });
      const child = await db.comments.create({
        data: {
          cid: article.cid,
          name: "子",
          content: "子评论",
          status: 1,
          parent_id: parent.coid,
        },
      });
      expect(child.parent_id).toBe(parent.coid);

      // 查询该文章全部评论
      const all = await db.comments.findMany({
        where: { cid: article.cid },
        orderBy: { coid: "asc" },
      });
      expect(all).toHaveLength(2);
      expect(all[1]!.parent_id).toBe(parent.coid);
    });

    test("contentrelations 多标签关联文章", async () => {
      const article = await db.contents.create({
        data: {
          title: "t",
          slug: "t",
          status: 1,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });
      const t1 = await db.metas.create({ data: { name: "t1", slug: "t1", type: "tag" } });
      const t2 = await db.metas.create({ data: { name: "t2", slug: "t2", type: "tag" } });
      const cat = await db.metas.create({ data: { name: "c1", slug: "c1", type: "category" } });

      await db.contentrelations.create({ data: { cid: article.cid, mid: t1.mid } });
      await db.contentrelations.create({ data: { cid: article.cid, mid: t2.mid } });
      await db.contentrelations.create({ data: { cid: article.cid, mid: cat.mid } });

      const tags = await db.contentrelations.findMany({
        where: { cid: article.cid },
        include: { metas: { select: { type: true, name: true } } },
      });
      expect(tags).toHaveLength(3);
      expect(tags.filter(t => t.metas.type === "tag")).toHaveLength(2);
      expect(tags.filter(t => t.metas.type === "category")).toHaveLength(1);
    });
  });
}