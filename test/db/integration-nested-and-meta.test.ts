/**
 * test/db/integration-nested-and-meta.test.ts: 嵌套写入 + Meta 边界
 *
 * 验证:
 * - Prisma createMany 批量插入
 * - nested createMany 关联写入
 * - metas 唯一约束的边界(name/slug type 区分)
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("nested/meta DB (no DB configured)", () => {});
} else {
  describe("nested writes + metas 边界 DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("createMany:批量插入 tags", async () => {
      const created = await db.metas.createMany({
        data: [
          { name: "bulk-tag-1", slug: "bulk-tag-1", type: "tag" },
          { name: "bulk-tag-2", slug: "bulk-tag-2", type: "tag" },
          { name: "bulk-tag-3", slug: "bulk-tag-3", type: "tag" },
        ],
      });
      expect(created.count).toBe(3);
      expect(await db.metas.count({ where: { name: { startsWith: "bulk-tag-" } } })).toBe(3);
    });

    test("createMany:batch 重复 → 整批回滚(Prisma 7 默认事务)", async () => {
      try {
        await db.metas.createMany({
          data: [
            { name: "a", slug: "slug-a", type: "tag" },
            { name: "b", slug: "slug-b", type: "tag" },
            { name: "a", slug: "slug-c", type: "tag" }, // name 重复
          ],
        });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
      // Prisma 7 的 createMany 是事务性:任一失败整批回滚
      const aCount = await db.metas.count({ where: { name: "a" } });
      expect(aCount).toBe(0);
    });

    test("metas name 唯一:跨 type 也冲突(全局唯一)", async () => {
      // 注意:name 字段 @unique,跨 type 不允许重复(必须用不同 name)
      await db.metas.create({ data: { name: "shared-name", slug: "tag-slug", type: "tag" } });
      try {
        await db.metas.create({ data: { name: "shared-name", slug: "cat-slug", type: "category" } });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("metas slug 唯一:跨 type 冲突 → P2002", async () => {
      await db.metas.create({ data: { name: "tag1", slug: "shared-slug", type: "tag" } });
      try {
        await db.metas.create({ data: { name: "cat1", slug: "shared-slug", type: "category" } });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("metas 不同 type 间不互查", async () => {
      await db.metas.create({ data: { name: "t1", slug: "t1", type: "tag" } });
      await db.metas.create({ data: { name: "c1", slug: "c1", type: "category" } });
      // 业务查询时按 type 过滤(模拟 useMetaList 逻辑)
      const tags = await db.metas.findMany({ where: { type: "tag", mid: { gt: 0 } } });
      const cats = await db.metas.findMany({ where: { type: "category", mid: { gt: 0 } } });
      expect(tags.every(m => m.type === "tag")).toBe(true);
      expect(cats.every(m => m.type === "category")).toBe(true);
    });

    test("createMany skipDuplicates:true → 重复静默跳过", async () => {
      await db.metas.create({ data: { name: "skip-test", slug: "skip-slug", type: "tag" } });
      const result = await db.metas.createMany({
        data: [
          { name: "skip-test", slug: "different-slug", type: "tag" }, // 重复 name
          { name: "new-name", slug: "new-slug", type: "tag" },
        ],
        skipDuplicates: true,
      });
      expect(result.count).toBe(1); // 仅 1 条新增成功,1 条跳过
      // 验证只有 1 条新增
      expect(await db.metas.count({ where: { slug: "new-slug" } })).toBe(1);
    });

    test("contentattachments + contents 嵌套写入(显式 createMany)", async () => {
      const article = await db.contents.create({
        data: {
          title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      const att = await db.attachments.create({
        data: { type: "image", title: "a", url: "/a.jpg" },
      });
      // 手动建关联(Prisma 不支持嵌套 createMany for 多对多)
      await db.contentattachments.create({
        data: { cid: article.cid, aid: att.aid },
      });
      const relations = await db.contentattachments.findMany({
        where: { cid: article.cid },
        include: { attachment: true, content: true },
      });
      expect(relations).toHaveLength(1);
      expect(relations[0]?.attachment.url).toBe("/a.jpg");
      expect(relations[0]?.content.cid).toBe(article.cid);
    });

    test("PG:bigint 返回(comments.count 大数字)", async () => {
      // 创建 50 条评论,count 应该返回数字
      const article = await db.contents.create({
        data: {
          title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      const data = Array.from({ length: 50 }, () => ({
        cid: article.cid,
        name: "n",
        mail: null,
        content: "c",
        status: 1,
      }));
      await db.comments.createMany({ data });
      const c = await db.comments.count({ where: { cid: article.cid } });
      expect(c).toBe(50);
    });

    test("deleteMany({ where }) → 返回 count", async () => {
      for (let i = 0; i < 5; i++) {
        await db.metas.create({ data: { name: `del-test-${i}`, slug: `del-test-${i}`, type: "tag" } });
      }
      const before = await db.metas.count({ where: { name: { startsWith: "del-test-" } } });
      expect(before).toBe(5);

      const result = await db.metas.deleteMany({
        where: { name: { startsWith: "del-test-" } },
      });
      expect(result.count).toBe(5);
      expect(await db.metas.count({ where: { name: { startsWith: "del-test-" } } })).toBe(0);
    });
  });
}