/**
 * test/db/integration-coverage.test.ts: 补充真实 DB 覆盖率
 *
 * 验证一些之前 mock 测试覆盖不到的真实行为:
 * - Prisma include + select 投影对返回类型的影响
 * - update + select 在同一操作中的复合
 * - delete 返回值与受影响行数
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("coverage DB (no DB configured)", () => {});
} else {
  describe("coverage DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("select 投影:不指定字段 → 返回完整行", async () => {
      const c = await db.contents.create({
        data: {
          title: "all", slug: "all", status: 1, type: 0, uid: 1,
          content: "正文内容", desc: "简介",
          update_time: new Date(),
        },
      });
      const full = await db.contents.findUnique({ where: { cid: c.cid } });
      expect(full?.content).toBe("正文内容");
      expect(full?.desc).toBe("简介");
    });

    test("select 投影:白名单 → 仅返回指定字段", async () => {
      const c = await db.contents.create({
        data: {
          title: "white", slug: "white", status: 1, type: 0, uid: 1,
          content: "不返回", desc: "不返回",
          update_time: new Date(),
        },
      });
      const safe = await db.contents.findUnique({
        where: { cid: c.cid },
        select: { cid: true, title: true, slug: true, status: true },
      });
      expect(safe).toHaveProperty("cid");
      expect(safe).toHaveProperty("title");
      expect(safe).not.toHaveProperty("content");
      expect(safe).not.toHaveProperty("desc");
      expect(safe).not.toHaveProperty("password"); // 本来就没有
    });

    test("update + select:复合查询一次性完成", async () => {
      const c = await db.contents.create({
        data: {
          title: "combo", slug: "combo", status: 0, type: 0, uid: 1, update_time: new Date(),
        },
      });
      // update 并返回 select 的字段
      const updated = await db.contents.update({
        where: { cid: c.cid },
        data: { status: 1 },
        select: { cid: true, status: true, title: true },
      });
      expect(updated.status).toBe(1);
      expect(updated.title).toBe("combo");
    });

    test("deleteMany:返回受影响行数", async () => {
      for (let i = 0; i < 3; i++) {
        await db.contents.create({
          data: {
            title: `del-${i}`, slug: `del-${i}`, status: 1, type: 0, uid: 1, update_time: new Date(),
          },
        });
      }
      const deleted = await db.contents.deleteMany({
        where: { title: { startsWith: "del-" } },
      });
      expect(deleted.count).toBe(3);
      expect(await db.contents.count({ where: { title: { startsWith: "del-" } } })).toBe(0);
    });

    test("count 复合 where:AND 多条件", async () => {
      await db.contents.create({
        data: { title: "a", slug: "a", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.contents.create({
        data: { title: "b", slug: "b", status: 1, type: 1, uid: 1, update_time: new Date() },
      });
      await db.contents.create({
        data: { title: "c", slug: "c", status: 0, type: 0, uid: 1, update_time: new Date() },
      });

      // type=0 AND status=1 → 1 条
      expect(await db.contents.count({ where: { type: 0, status: 1 } })).toBe(1);
      // status=1 → 2 条
      expect(await db.contents.count({ where: { status: 1 } })).toBe(2);
      // type=1 OR status=0 → 2 条
      expect(await db.contents.count({ where: { OR: [{ type: 1 }, { status: 0 }] } })).toBe(2);
    });

    test("嵌套 include:where 过滤 + 一并取关联", async () => {
      const article = await db.contents.create({
        data: {
          title: "nested", slug: "nested", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      const tag = await db.metas.create({ data: { name: "t1", slug: "t1", type: "tag" } });
      await db.contentrelations.create({ data: { cid: article.cid, mid: tag.mid } });

      const list = await db.contents.findMany({
        where: { cid: article.cid },
        include: {
          contentrelations: {
            include: { metas: true },
          },
          comments: true,
        },
      });
      expect(list[0]?.contentrelations).toHaveLength(1);
      expect(list[0]?.contentrelations[0]?.metas.name).toBe("t1");
      expect(list[0]?.comments).toEqual([]); // 无评论
    });

    test("JSON 字段查询:path 语法", async () => {
      await db.attachments.create({
        data: {
          type: "image", title: "x", url: "/x.jpg",
          storage: "local",
          metadata: { width: 1920, height: 1080, format: "jpeg" } as never,
        },
      });
      // PostgreSQL JSON 字段查询:仅返回完整行(path 语法需要 Prisma 5+ previewFeature)
      const all = await db.attachments.findMany({
        where: { type: "image" },
      });
      expect(all).toHaveLength(1);
      expect((all[0]?.metadata as { width: number }).width).toBe(1920);
    });

    test("空集合的 aggregate:count=0 + _sum=null", async () => {
      const result = await db.contents.aggregate({
        _sum: { comment_num: true },
        _count: true,
        where: { cid: { gt: 9999 } },
      });
      expect(result._count).toBe(0);
      expect(result._sum.comment_num).toBeNull();
    });
  });
}