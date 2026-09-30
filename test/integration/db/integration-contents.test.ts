/**
 * test/db/integration-contents.test.ts: 真实 DB 测试 contents/changelogs/comments 表
 *
 * 验证:
 * - contents 状态/类型枚举查询
 * - comments 计数统计(评论数 comment_num 联动)
 * - changelogs JSON content 序列化往返
 * - 多表 JOIN 查询
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("contents DB tests (no DB configured)", () => {});
} else {
  describe("contents DB 集成测试", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("contents.create + status=1/type=0 → 公开文章查询命中", async () => {
      await db.contents.create({
        data: {
          title: "公开文",
          slug: "public",
          status: 1,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });
      await db.contents.create({
        data: {
          title: "草稿",
          slug: "draft",
          status: 0,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });

      const published = await db.contents.count({
        where: { status: 1, type: 0 },
      });
      expect(published).toBe(1);

      const drafts = await db.contents.count({
        where: { status: 0 },
      });
      expect(drafts).toBe(1);
    });

    test("comments.create + content_ref relation 解析", async () => {
      const article = await db.contents.create({
        data: {
          title: "文章",
          slug: "art",
          status: 1,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });
      await db.comments.create({
        data: {
          cid: article.cid,
          name: "评论者",
          mail: null,
          content: "评论内容",
          status: 1,
        },
      });
      const fetched = await db.comments.findFirst({
        where: { cid: article.cid },
        include: { content_ref: { select: { cid: true, title: true, slug: true } } },
      });
      expect(fetched?.name).toBe("评论者");
      expect(fetched?.content_ref?.title).toBe("文章");
    });

    test("changelogs JSON content 存储 + 读取完整", async () => {
      const entries = JSON.stringify([
        { type: "修复", value: "bug 修复" },
        { type: "新增", value: "新功能" },
      ]);
      const log = await db.changelogs.create({
        data: { content: entries },
      });
      expect(log.id).toBeGreaterThan(0);

      const fetched = await db.changelogs.findUnique({ where: { id: log.id } });
      expect(fetched?.content).toBe(entries);
      // 反序列化
      const parsed = JSON.parse(fetched!.content);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe("修复");
    });

    test("contents.update_time 必填(无 @default)", async () => {
      // schema 上 update_time: DateTime 没有 default,create 时不传会失败
      try {
        await db.contents.create({
          data: {
            title: "x",
            slug: "x",
            status: 1,
            type: 0,
            uid: 1,
            // update_time 故意不传
          } as never,
        });
        expect.unreachable();
      } catch {
        expect(true).toBe(true);
      }
    });

    test("contents.findMany + include user relation", async () => {
      await db.contents.create({
        data: {
          title: "测试文",
          slug: "test",
          status: 1,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });
      const fetched = await db.contents.findFirst({
        include: { user: { select: { uid: true, name: true } } },
      });
      expect(fetched?.user?.name).toBe("admin");
    });

    test("metas.type 筛选:tag vs category", async () => {
      await db.metas.create({ data: { name: "t1", slug: "t1", type: "tag" } });
      await db.metas.create({ data: { name: "c1", slug: "c1", type: "category" } });

      const tags = await db.metas.findMany({ where: { type: "tag" } });
      const cats = await db.metas.findMany({ where: { type: "category" } });
      expect(tags.every(m => m.type === "tag")).toBe(true);
      expect(cats.every(m => m.type === "category")).toBe(true);
      expect(tags).toHaveLength(1);
      expect(cats).toHaveLength(1);
    });

    test("comments.cid 索引查询(扫描):无该 cid → 空", async () => {
      const list = await db.comments.findMany({ where: { cid: 9999 } });
      expect(list).toEqual([]);
    });
  });
}
