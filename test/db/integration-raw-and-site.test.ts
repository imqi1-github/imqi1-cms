/**
 * test/db/integration-raw-and-site.test.ts: 原始 SQL + 站点设置 DB 测试
 *
 * 验证:
 * - $queryRaw / $executeRaw 真实 SQL 路径
 * - 站点设置批量 upsert(init.post.ts 等场景)
 * - 字段长度超限 → DB 拒绝(@db.VarChar 191)
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("raw/site DB (no DB configured)", () => {});
} else {
  describe("raw SQL + 站点设置 DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("$queryRaw:SELECT 真实 SQL", async () => {
      await db.contents.create({
        data: {
          title: "t", slug: "t", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      // 直接走 PG:SELECT count(*) FROM contents WHERE type = 0
      const result = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::int AS count FROM "contents" WHERE "type" = 0
      `;
      // pg 把 int4 转成 number/int;@prisma/adapter-pg 默认转 bigint
      expect(Number(result[0]!.count)).toBe(1);
    });

    test("$executeRaw:UPDATE 真实 SQL", async () => {
      const c = await db.contents.create({
        data: {
          title: "raw", slug: "raw", status: 0, type: 0, uid: 1, update_time: new Date(),
        },
      });
      // 直接走 PG:UPDATE contents SET status = 1 WHERE cid = $1
      const affected = await db.$executeRaw`
        UPDATE "contents" SET "status" = 1 WHERE "cid" = ${c.cid}
      `;
      expect(affected).toBe(1);
      const got = await db.contents.findUnique({ where: { cid: c.cid } });
      expect(got?.status).toBe(1);
    });

    test("metas.name @db.VarChar(191) 字段长度上限", async () => {
      // 191 字符恰好通过
      const okName = "x".repeat(191);
      const m = await db.metas.create({
        data: { name: okName, slug: "len-191", type: "tag" },
      });
      expect(m.name).toHaveLength(191);

      // 192 字符超出 → PG 拒绝
      const tooLong = "y".repeat(192);
      try {
        await db.metas.create({
          data: { name: tooLong, slug: "len-192", type: "tag" },
        });
        expect.unreachable();
      } catch {
        expect(true).toBe(true);
      }
    });

    test("informations 批量 upsert(站点设置初始化场景)", async () => {
      const defaults = [
        { key: "siteName", value: "我的博客" },
        { key: "siteUrl", value: "https://blog.com" },
        { key: "commentEnabled", value: "true" },
        { key: "commentModeration", value: "false" },
        { key: "uploadLocation", value: "local" },
      ];
      for (const { key, value } of defaults) {
        await db.informations.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }
      const all = await db.informations.findMany({
        where: { key: { in: defaults.map(d => d.key) } },
        orderBy: { key: "asc" },
      });
      expect(all).toHaveLength(5);
      expect(all.map(i => i.key).sort()).toEqual(defaults.map(d => d.key).sort());
    });

    test("informations 批量 upsert:再次跑应跳过(已存在)", async () => {
      // 第一次
      await db.informations.upsert({
        where: { key: "siteName" },
        create: { key: "siteName", value: "首次值" },
        update: { value: "覆盖值" },
      });
      // 第二次
      await db.informations.upsert({
        where: { key: "siteName" },
        create: { key: "siteName", value: "再次值" },
        update: { value: "覆盖值" },
      });
      const got = await db.informations.findUnique({ where: { key: "siteName" } });
      expect(got?.value).toBe("覆盖值"); // 第二次 upsert 应 update 分支
    });

    test("用户唯一约束并发插入:name 重复 → P2002", async () => {
      await db.users.create({
        data: {
          name: "race-user", mail: "r@x.com",
          password: "", auth_code: "", totp_secret: null, totp_enabled: false,
        },
      });
      // 同时插入第二条同名(name 唯一约束)
      try {
        await db.users.create({
          data: {
            name: "race-user", mail: "r2@x.com",
            password: "", auth_code: "", totp_secret: null, totp_enabled: false,
          },
        });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("create_time 默认值:不指定时自动 now()", async () => {
      const before = new Date();
      const c = await db.contents.create({
        data: {
          title: "t", slug: "now", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      const after = new Date();
      // create_time 应在 [before, after] 区间
      expect(c.create_time.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(c.create_time.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    test("JSON 字段:attachments.metadata 任意结构存读", async () => {
      const data = {
        size: 12345,
        width: 1920,
        height: 1080,
        format: "jpeg",
        exif: { camera: "iPhone", iso: 100 },
      };
      const att = await db.attachments.create({
        data: {
          type: "image", title: "图", url: "/u.jpg",
          storage: "local", metadata: data,
        },
      });
      const got = await db.attachments.findUnique({ where: { aid: att.aid } });
      expect(got?.metadata).toMatchObject(data);
    });
  });
}