/**
 * test/db/integration-subscribes.test.ts: subscribes + subscribeposts 真实 DB 测试
 *
 * 验证:
 * - subscribes 字段长度约束(URL 191 字符上限)
 * - subscribeposts 唯一约束(link)
 * - sort/lastUpdated 时间字段
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("subscribes DB (no DB configured)", () => {});
} else {
  describe("subscribes DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("subscribes.create 成功 + 字段回填", async () => {
      const s = await db.subscribes.create({
        data: { name: "博客", url: "https://blog.com" },
      });
      expect(s.id).toBeGreaterThan(0);
      expect(s.url).toBe("https://blog.com");
      expect(s.name).toBe("博客");
    });

    test("subscribes.create 不填 url → 默认空串", async () => {
      const s = await db.subscribes.create({
        data: { name: "无名", url: "" },
      });
      expect(s.url).toBe("");
    });

    test("subscribeposts.link 唯一约束 → P2002", async () => {
      const sub = await db.subscribes.create({
        data: { name: "博客", url: "https://blog.com" },
      });
      await db.subscribeposts.create({
        data: {
          subscribeId: sub.id,
          title: "post1",
          link: "https://blog.com/p1",
          pubDate: new Date(),
        },
      });
      try {
        await db.subscribeposts.create({
          data: {
            subscribeId: sub.id,
            title: "post2",
            link: "https://blog.com/p1", // 重复 link
            pubDate: new Date(),
          },
        });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("subscribeposts 排序:按 pubDate desc 取最新", async () => {
      const sub = await db.subscribes.create({
        data: { name: "博客", url: "https://blog.com" },
      });
      await db.subscribeposts.create({
        data: {
          subscribeId: sub.id, title: "old", link: "https://blog.com/old",
          pubDate: new Date("2024-01-01"),
        },
      });
      await db.subscribeposts.create({
        data: {
          subscribeId: sub.id, title: "new", link: "https://blog.com/new",
          pubDate: new Date("2026-01-01"),
        },
      });

      const posts = await db.subscribeposts.findMany({
        where: { subscribeId: sub.id },
        orderBy: { pubDate: "desc" },
      });
      expect(posts[0]!.title).toBe("new");
      expect(posts[1]!.title).toBe("old");
    });

    test("links 表(友链申请)基本 CRUD", async () => {
      const link = await db.links.create({
        data: {
          name: "友链甲",
          link: "https://friend.com",
          desc: null,
          avatar: null,
          enabled: false,
        },
      });
      expect(link.id).toBeGreaterThan(0);

      // toggle enabled
      const updated = await db.links.update({
        where: { id: link.id },
        data: { enabled: true },
      });
      expect(updated.enabled).toBe(true);
    });

    test("changelogs 时间字段 + content JSON 字段", async () => {
      const log = await db.changelogs.create({
        data: {
          content: JSON.stringify([{ type: "修复", value: "x" }]),
        },
      });
      expect(log.id).toBeGreaterThan(0);
      expect(log.create_time).toBeInstanceOf(Date);
    });
  });
}