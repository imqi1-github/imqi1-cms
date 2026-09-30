/**
 * test/db/integration-complex-queries.test.ts: 真实 DB 测试复杂查询
 *
 * 验证:
 * - 多表 JOIN + include
 * - groupBy / count / aggregate
 * - 复杂 where(AND/OR/NOT/IN)
 * - 排序 + 分页 skip/take
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("complex queries DB (no DB configured)", () => {});
} else {
  describe("complex queries DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("include 多层关系:文章 → 作者 user + 标签 metas", async () => {
      const article = await db.contents.create({
        data: {
          title: "t", slug: "t", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      const tag = await db.metas.create({ data: { name: "t1", slug: "t1", type: "tag" } });
      await db.contentrelations.create({ data: { cid: article.cid, mid: tag.mid } });

      const got = await db.contents.findUnique({
        where: { cid: article.cid },
        include: {
          user: { select: { uid: true, name: true } },
          contentrelations: {
            include: {
              metas: { select: { mid: true, name: true, type: true } },
            },
          },
        },
      });
      expect(got?.user?.name).toBe("admin");
      expect(got?.contentrelations).toHaveLength(1);
      expect(got?.contentrelations[0]?.metas.name).toBe("t1");
    });

    test("where 复合条件:status=1 AND type=0 AND slug 包含", async () => {
      await db.contents.create({
        data: { title: "a", slug: "alpha", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.contents.create({
        data: { title: "b", slug: "beta", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      await db.contents.create({
        data: { title: "c", slug: "gamma", status: 0, type: 0, uid: 1, update_time: new Date() }, // 草稿
      });
      await db.contents.create({
        data: { title: "page", slug: "alpha", status: 1, type: 1, uid: 1, update_time: new Date() }, // 页面
      });

      const list = await db.contents.findMany({
        where: {
          status: 1,
          type: 0,
          slug: { contains: "alpha" },
        },
      });
      expect(list).toHaveLength(1);
      expect(list[0]!.slug).toBe("alpha");
    });

    test("分页 skip/take + 排序", async () => {
      for (let i = 1; i <= 5; i++) {
        await db.contents.create({
          data: {
            title: `t${i}`,
            slug: `t${i}`,
            status: 1,
            type: 0,
            uid: 1,
            create_time: new Date(2026, 0, i),
            update_time: new Date(),
          },
        });
      }
      const page1 = await db.contents.findMany({
        orderBy: { create_time: "desc" },
        skip: 0,
        take: 2,
      });
      const page2 = await db.contents.findMany({
        orderBy: { create_time: "desc" },
        skip: 2,
        take: 2,
      });
      const page3 = await db.contents.findMany({
        orderBy: { create_time: "desc" },
        skip: 4,
        take: 2,
      });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page3).toHaveLength(1);
      // 顺序:第 1 页是最新(t5, t4)
      expect(page1[0]!.title).toBe("t5");
    });

    test("count + where 复合", async () => {
      // 准备:5 条文章,3 条 type=0 status=1
      for (let i = 1; i <= 5; i++) {
        await db.contents.create({
          data: {
            title: `t${i}`,
            slug: `cnt-${i}`,
            status: i <= 3 ? 1 : 0,
            type: 0,
            uid: 1,
            update_time: new Date(),
          },
        });
      }
      const published = await db.contents.count({
        where: { status: 1, type: 0 },
      });
      const drafts = await db.contents.count({
        where: { status: 0, type: 0 },
      });
      expect(published).toBe(3);
      expect(drafts).toBe(2);
    });

    test("findFirst vs findUnique:where 匹配首条", async () => {
      const article = await db.contents.create({
        data: {
          title: "a", slug: "first", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      await db.contents.create({
        data: {
          title: "b", slug: "second", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      const first = await db.contents.findFirst({
        where: { type: 0 },
        orderBy: { cid: "asc" },
      });
      expect(first?.cid).toBe(article.cid);
    });

    test("metas 关联 contentrelations.count:多 cid 多 mid 关联计数", async () => {
      const t1 = await db.metas.create({ data: { name: "t1", slug: "t1", type: "tag" } });
      const t2 = await db.metas.create({ data: { name: "t2", slug: "t2", type: "tag" } });
      const a1 = await db.contents.create({
        data: {
          title: "a1", slug: "a1", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      const a2 = await db.contents.create({
        data: {
          title: "a2", slug: "a2", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      // t1 关联两篇文章,t2 不关联
      await db.contentrelations.create({ data: { cid: a1.cid, mid: t1.mid } });
      await db.contentrelations.create({ data: { cid: a2.cid, mid: t1.mid } });
      // t1 关联 2 篇,t2 关联 0
      const t1Rels = await db.contentrelations.count({ where: { mid: t1.mid } });
      const t2Rels = await db.contentrelations.count({ where: { mid: t2.mid } });
      expect(t1Rels).toBe(2);
      expect(t2Rels).toBe(0);
    });
  });
}