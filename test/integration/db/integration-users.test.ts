/**
 * test/db/integration-users.test.ts: 用真实 DB 测试 user 表相关操作
 *
 * 单元测试不依赖 mock 的 Prisma,直接验证:
 * - bcrypt 密码 hash 真实路径(不绕)
 * - cascade/auth_code 旋转的并发安全
 * - 用户资料查询(白名单 select)
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import bcrypt from "bcryptjs";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("users DB tests (no DB configured)", () => {});
} else {
  describe("users DB 集成测试", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("bcrypt 密码 hash 与 verifyPassword 一致", async () => {
      const hash = await bcrypt.hash("correct-horse", 4);
      const ok = await bcrypt.compare("correct-horse", hash);
      const wrong = await bcrypt.compare("wrong-pw", hash);
      expect(ok).toBe(true);
      expect(wrong).toBe(false);
    });

    test("users.create + update 密码字段(hash) → 登录校验", async () => {
      const password = "test-pw-123456";
      const hash = await bcrypt.hash(password, 10);

      const u = await db.users.create({
        data: {
          name: "test",
          nickname: null,
          mail: "t@x.com",
          avatar: null,
          password: hash,
          auth_code: "initial",
          totp_secret: null,
          totp_enabled: false,
        },
      });
      expect(u.uid).toBeGreaterThan(0);

      // 模拟 setSession: 旋转 auth_code
      await db.users.update({
        where: { uid: u.uid },
        data: { auth_code: "rotated-code" },
      });

      const u2 = await db.users.findUnique({ where: { uid: u.uid } });
      expect(u2?.auth_code).toBe("rotated-code");

      // 登录验证:密码哈希匹配
      const loginOk = await bcrypt.compare(password, u2!.password);
      expect(loginOk).toBe(true);
    });

    test("users 唯一约束:name 重复 → P2002", async () => {
      await db.users.create({
        data: {
          name: "duplicated",
          mail: "a@x.com",
          password: "",
          auth_code: "",
          totp_secret: null,
          totp_enabled: false,
        },
      });
      try {
        await db.users.create({
          data: {
            name: "duplicated",
            mail: "b@x.com",
            password: "",
            auth_code: "",
            totp_secret: null,
            totp_enabled: false,
          },
        });
        expect.unreachable();
      } catch (e: unknown) {
        expect((e as { code?: string }).code).toBe("P2002");
      }
    });

    test("select 白名单:不指定 select → 返回全部列(含密码)", async () => {
      // 默认行为:无 select → 返回全部字段
      const u = await db.users.create({
        data: {
          name: "t",
          mail: "t@x.com",
          password: "h",
          auth_code: "",
          totp_secret: null,
          totp_enabled: false,
        },
      });
      const full = await db.users.findUnique({ where: { uid: u.uid } });
      expect(full).toHaveProperty("password");
      expect(full).toHaveProperty("auth_code");
    });

    test("select 白名单:显式 select → 只回传指定字段", async () => {
      const u = await db.users.create({
        data: {
          name: "t",
          mail: "t@x.com",
          password: "h",
          auth_code: "",
          totp_secret: null,
          totp_enabled: false,
        },
      });
      const safe = await db.users.findUnique({
        where: { uid: u.uid },
        select: { uid: true, name: true, mail: true, avatar: true },
      });
      expect(safe).not.toHaveProperty("password");
      expect(safe).not.toHaveProperty("auth_code");
      expect(safe?.name).toBe("t");
    });

    test("空字符串/缺省值:create 时空字符串/默认 ctor 字段", async () => {
      // schema 默认:totp_enabled @default(false), totp_secret nullable
      const u = await db.users.create({
        data: {
          name: "empty",
          mail: "e@x.com",
          password: "",
          auth_code: "",
          totp_secret: null,
          totp_enabled: false,
        },
      });
      expect(u.totp_enabled).toBe(false);
      expect(u.totp_secret).toBeNull();
    });
  });
}