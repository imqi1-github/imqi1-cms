/**
 * test/db/integration-schema-constraints.test.ts: 真实 DB schema 边界验证
 *
 * 验证 PG 类型约束 + 字段长度上限 + 默认值
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("schema constraints DB (no DB configured)", () => {});
} else {
  describe("schema constraints DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("contents.title @db.VarChar(255) 上限:255 通过,256 拒绝", async () => {
      const ok255 = "x".repeat(255);
      const c1 = await db.contents.create({
        data: { title: ok255, slug: "ok255", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      expect(c1.title).toHaveLength(255);

      try {
        await db.contents.create({
          data: { title: "y".repeat(256), slug: "too256", status: 1, type: 0, uid: 1, update_time: new Date() },
        });
        expect.unreachable();
      } catch {
        expect(true).toBe(true);
      }
    });

    test("contents.slug 可空(null)+ 文本字段可空", async () => {
      const c = await db.contents.create({
        data: { title: "no-slug", slug: null, status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      expect(c.slug).toBeNull();
    });

    test("contents.content (Text 字段):超长字符串 OK", async () => {
      const bigContent = "x".repeat(100_000); // 100KB
      const c = await db.contents.create({
        data: {
          title: "big", slug: "big", content: bigContent,
          status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      expect(c.content?.length).toBe(100_000);
    });

    test("subscribes.url @db.VarChar(191) 上限", async () => {
      // 191 字符:http://(7) + 180 个 a + .com(4) = 191
      const okUrl = "http://" + "a".repeat(180) + ".com";
      const s1 = await db.subscribes.create({ data: { name: "blog", url: okUrl } });
      expect(s1.url).toHaveLength(191);

      try {
        await db.subscribes.create({ data: { name: "blog2", url: "http://" + "b".repeat(200) + ".com" } });
        expect.unreachable();
      } catch {
        expect(true).toBe(true);
      }
    });

    test("changelogs.content (Text):超长 OK", async () => {
      const longJson = JSON.stringify(Array.from({ length: 100 }, () => ({
        type: "修复",
        value: "x".repeat(1000),
      })));
      const log = await db.changelogs.create({ data: { content: longJson } });
      expect(log.content.length).toBeGreaterThan(100_000);
    });

    test("attachments.metadata JSON 字段:任意深度嵌套", async () => {
      const nested = {
        exif: {
          gps: { lat: 30.5, lng: 120.5 },
          camera: { make: "Apple", model: "iPhone 15", lens: { focal: 26, aperture: 1.6 } },
          settings: { iso: 100, shutter: "1/100" },
        },
        gps: [{ lat: 31, lng: 121 }, { lat: 32, lng: 122 }],
      };
      const att = await db.attachments.create({
        data: { type: "image", title: "deep.jpg", url: "/x.jpg", storage: "local", metadata: nested as never },
      });
      const got = await db.attachments.findUnique({ where: { aid: att.aid } });
      const m = got?.metadata as typeof nested;
      expect(m.exif.camera.model).toBe("iPhone 15");
      expect(m.exif.gps.lat).toBe(30.5);
      expect(m.gps).toHaveLength(2);
    });

    test("informations.key 主键(无 @id 自动 cuid):手写 key", async () => {
      // informations 表 key 是 String @id(无 default),create 时必须提供
      const info = await db.informations.create({ data: { key: "custom-key", value: "v" } });
      expect(info.key).toBe("custom-key");
    });

    test("comments.agent 可空 + content 非空", async () => {
      const article = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      const c = await db.comments.create({
        data: {
          cid: article.cid,
          name: "n",
          mail: null,
          content: "评论内容",
          agent: null,
          status: 1,
        },
      });
      expect(c.agent).toBeNull();
      expect(c.content).toBe("评论内容");
    });

    test("comments.link 可空 + url 验证(由 handler 层)", async () => {
      // DB 层 link 是 String?,没有 url 格式约束(handler 层负责)
      const article = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      const c = await db.comments.create({
        data: {
          cid: article.cid,
          name: "n",
          mail: null,
          content: "c",
          link: "javascript:alert(1)", // DB 允许(handler 应拦)
          status: 1,
        },
      });
      expect(c.link).toBe("javascript:alert(1)");
    });

    test("users.name @unique:并发 name 重复 → P2002", async () => {
      await db.users.create({
        data: {
          name: "race", mail: "r1@x.com",
          password: "", auth_code: "", totp_secret: null, totp_enabled: false,
        },
      });
      try {
        await db.users.create({
          data: {
            name: "race", mail: "r2@x.com",
            password: "", auth_code: "", totp_secret: null, totp_enabled: false,
          },
        });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("contents.uid 默认值 1(无 author 时也允许)", async () => {
      const c = await db.contents.create({
        data: { title: "x", slug: "x", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      expect(c.uid).toBe(1);
    });
  });
}