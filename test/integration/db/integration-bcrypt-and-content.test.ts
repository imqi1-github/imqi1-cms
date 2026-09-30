/**
 * test/db/integration-bcrypt-and-content.test.ts: bcrypt + 内容处理真实路径
 *
 * 验证:
 * - 真 bcrypt 不同 cost 因子的差异
 * - 真 Prisma + 真 bcrypt 完整用户生命周期
 * - 真实并发 bcrypt 哈希
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import bcrypt from "bcryptjs";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("bcrypt+content DB (no DB configured)", () => {});
} else {
  describe("bcrypt + 内容处理 DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("bcrypt cost 4 vs 10:hash 前缀不同但都验证通过", async () => {
      const pw = "test-pw-123456";
      const hash4 = await bcrypt.hash(pw, 4);
      const hash10 = await bcrypt.hash(pw, 10);
      // 总长度都是 60,但 cost 因子前缀不同
      expect(hash4.startsWith("$2b$04$")).toBe(true);
      expect(hash10.startsWith("$2b$10$")).toBe(true);
      expect(await bcrypt.compare(pw, hash4)).toBe(true);
      expect(await bcrypt.compare(pw, hash10)).toBe(true);
      // 两个 hash 都是不同的(每次随机 salt)
      expect(hash4).not.toBe(hash10);
    });

    test("完整用户生命周期:创建 → 登录 → 改密 → 再登录", async () => {
      const originalPw = "original-pw-123456";
      const newPw = "new-pw-654321";
      const hash = await bcrypt.hash(originalPw, 10);

      // 1. 创建
      const u = await db.users.create({
        data: {
          name: "lifecycle-user",
          mail: "life@x.com",
          password: hash,
          auth_code: "",
          totp_secret: null,
          totp_enabled: false,
        },
      });
      expect(u.password).toMatch(/^\$2[aby]\$/); // bcrypt 哈希前缀

      // 2. 第一次登录校验
      const u1 = await db.users.findUnique({ where: { uid: u.uid } });
      expect(await bcrypt.compare(originalPw, u1!.password)).toBe(true);
      expect(await bcrypt.compare("wrong-pw", u1!.password)).toBe(false);

      // 3. 改密(更新 password 字段)
      const newHash = await bcrypt.hash(newPw, 10);
      await db.users.update({
        where: { uid: u.uid },
        data: { password: newHash },
      });

      // 4. 旧密失效,新密生效
      const u2 = await db.users.findUnique({ where: { uid: u.uid } });
      expect(await bcrypt.compare(originalPw, u2!.password)).toBe(false);
      expect(await bcrypt.compare(newPw, u2!.password)).toBe(true);
    });

    test("bcrypt 异步并发哈希:8 个并发 hash 不冲突", async () => {
      const promises: Array<Promise<string>> = [];
      for (let i = 0; i < 8; i++) {
        promises.push(bcrypt.hash(`pw-${i}`, 4));
      }
      const hashes = await Promise.all(promises);
      expect(hashes).toHaveLength(8);
      expect(new Set(hashes).size).toBe(8); // 全部唯一(不同 salt)
      // 每个都验证通过
      for (let i = 0; i < 8; i++) {
        expect(await bcrypt.compare(`pw-${i}`, hashes[i]!)).toBe(true);
      }
    });

    test("contents.create 大量数据插入(50 条)耗时 < 5s", async () => {
      const start = Date.now();
      await db.$transaction(
        Array.from({ length: 50 }, (_, i) =>
          db.contents.create({
            data: {
              title: `bulk-${i}`,
              slug: `bulk-${i}`,
              status: 1,
              type: 0,
              uid: 1,
              update_time: new Date(),
            },
          }),
        ),
      );
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
      expect(await db.contents.count({ where: { title: { startsWith: "bulk-" } } })).toBe(50);
    });

    test("contents.comment_num 默认 0 → update 可累加/减", async () => {
      const c = await db.contents.create({
        data: {
          title: "counter", slug: "counter", status: 1, type: 0, uid: 1, update_time: new Date(),
        },
      });
      expect(c.comment_num).toBe(0);

      // increment
      await db.contents.update({
        where: { cid: c.cid },
        data: { comment_num: { increment: 1 } },
      });
      const after1 = await db.contents.findUnique({ where: { cid: c.cid } });
      expect(after1?.comment_num).toBe(1);

      // decrement
      await db.contents.update({
        where: { cid: c.cid },
        data: { comment_num: { decrement: 1 } },
      });
      const after2 = await db.contents.findUnique({ where: { cid: c.cid } });
      expect(after2?.comment_num).toBe(0);
    });
  });
}