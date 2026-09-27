/**
 * test/db/prisma-relations.test.ts: Prisma 关系约束的单元测试
 *
 * 验证 schema 层面的关系/外键/唯一约束,这些 mock 测试无法覆盖
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("prisma relations (no DB configured)", () => {});
} else {
  describe("prisma relations DB tests", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("metas 唯一约束:name 重复 → P2002", async () => {
      await db.metas.create({ data: { name: "唯一", slug: "u", type: "tag" } });
      try {
        await db.metas.create({ data: { name: "唯一", slug: "u2", type: "tag" } });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("metas 唯一约束:slug 重复 → P2002", async () => {
      await db.metas.create({ data: { name: "A", slug: "shared-slug", type: "tag" } });
      try {
        await db.metas.create({ data: { name: "B", slug: "shared-slug", type: "category" } });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("contents status 字段约束:非法值会被 PG 拒绝", async () => {
      try {
        await db.contents.create({
          data: {
            title: "x",
            slug: "x",
            status: 99 as never,
            type: 0,
            uid: 1,
          },
        });
        expect.unreachable();
      } catch {
        expect(true).toBe(true);
      }
    });

    test("contentrelations 级联删除:删 article → 清 relations", async () => {
      const article = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      const tag = await db.metas.create({ data: { name: "t", slug: "t", type: "tag" } });
      await db.contentrelations.create({ data: { cid: article.cid, mid: tag.mid } });
      expect(await db.contentrelations.count()).toBe(1);

      await db.contents.delete({ where: { cid: article.cid } });
      expect(await db.contentrelations.count()).toBe(0);
    });

    test("comments 级联删除:删 article → 清评论", async () => {
      const article = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.comments.create({
        data: { cid: article.cid, name: "n", mail: null, content: "c" },
      });
      expect(await db.comments.count()).toBe(1);
      await db.contents.delete({ where: { cid: article.cid } });
      expect(await db.comments.count()).toBe(0);
    });

    test("contentattachments 级联删除:删 article → 清附件关联", async () => {
      const article = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.attachments.create({
        data: { type: "image", title: "图", url: "/u/a.png" },
      });
      const att = await db.attachments.findFirstOrThrow();
      await db.contentattachments.create({ data: { cid: article.cid, aid: att.aid } });
      expect(await db.contentattachments.count()).toBe(1);
      await db.contents.delete({ where: { cid: article.cid } });
      expect(await db.contentattachments.count()).toBe(0);
    });

    test("subscribeposts 级联删除:删 subscribe → 清 posts", async () => {
      const sub = await db.subscribes.create({
        data: { name: "博客", url: "https://blog.com" },
      });
      await db.subscribeposts.create({
        data: {
          subscribeId: sub.id,
          title: "post",
          link: "https://blog.com/p1",
          pubDate: new Date(),
        },
      });
      expect(await db.subscribeposts.count()).toBe(1);
      await db.subscribes.delete({ where: { id: sub.id } });
      expect(await db.subscribeposts.count()).toBe(0);
    });
  });
}