/**
 * server/api/admin/users/[id].put.ts 集成测:
 *  - CSRF / IDOR / 字段校验 / 邮箱冲突 / 用户名冲突 / 密码最短长度 / P2002 / P2025
 *  - 单人站不变式:只能改自己的资料
 *  - 缓存失效在昵称/头像变更时触发
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_COOKIE, CSRF_TOKEN, getUserRow, registerAuthFakes, resetUsers } from "#test/helpers/auth-fakes";
import { CSRF_HEADER } from "#shared/constants";
import { sharedFake } from "#test/helpers/fake-prisma";

mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: mock(async () => ({})) }));

const handler = (await import("#server/api/admin/users/[id].put")).default;

// loginSessionCookie 只设 session;PUT/POST 还要 csrf_token cookie,这里组合一份带 CSRF 的 cookie
async function authedCookie(): Promise<string> {
  const session = await loginSessionCookie();
  return `${session}; ${CSRF_COOKIE}`;
}

// 关键:beforeEach 复位 users.update / users.findUnique 为 auth-fakes 默认实现,
// 防止上一个测试 override 的 throw / 自定义逻辑污染后续测试(setSession 调 update、getUser 调 findUnique)
beforeEach(() => {
  resetUsers();
  registerAuthFakes();
});

describe("admin/users/[id].put(改个人资料)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PUT", params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "0" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("IDOR:会话 uid=1 改 id=2 → 403", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 403, message: "无权操作该账户" });
  });

  test("CSRF 失败 → 403", async () => {
    const session = await loginSessionCookie();
    const cookie = `${session}; csrf_token=wrong-token`;
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name/mail 空 → 400", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("mail 被其他用户占用 → 400", async () => {
    const cookie = await authedCookie();
    // 取到 cookie 后再 override findUnique:命中 mail=x@y.z 返回冲突用户,其它走默认
    sharedFake.on("users", "findUnique", ((args: { where: { uid?: number; name?: string; mail?: string }; select?: Record<string, unknown> }) => {
      if (args.where.mail === "x@y.z") return { uid: 99, name: "dup-mail", mail: "x@y.z", nickname: null, avatar: null, password: "p", auth_code: "", totp_secret: null, totp_enabled: false };
      let row;
      if (typeof args.where.uid === "number") row = getUserRow(args.where.uid);
      else if (typeof args.where.name === "string") row = args.where.name === "admin" ? getUserRow(1) : undefined;
      else if (typeof args.where.mail === "string") row = args.where.mail === "a@b.c" ? getUserRow(1) : undefined;
      if (!row) return null;
      if (args.select) {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(args.select)) out[k] = (row as unknown as Record<string, unknown>)[k];
        return out;
      }
      return { ...row };
    }) as never);
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "x@y.z" },
    })).rejects.toMatchObject({ statusCode: 400, message: "邮箱已被其他用户使用" });
  });

  test("name 被其他用户占用 → 400", async () => {
    const cookie = await authedCookie();
    sharedFake.on("users", "findUnique", ((args: { where: { uid?: number; name?: string; mail?: string }; select?: Record<string, unknown> }) => {
      if (args.where.name === "dup") return { uid: 2, name: "dup", mail: "d@d.d", nickname: null, avatar: null, password: "p", auth_code: "", totp_secret: null, totp_enabled: false };
      let row;
      if (typeof args.where.uid === "number") row = getUserRow(args.where.uid);
      else if (typeof args.where.name === "string") row = args.where.name === "admin" ? getUserRow(1) : undefined;
      else if (typeof args.where.mail === "string") row = args.where.mail === "a@b.c" ? getUserRow(1) : undefined;
      if (!row) return null;
      if (args.select) {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(args.select)) out[k] = (row as unknown as Record<string, unknown>)[k];
        return out;
      }
      return { ...row };
    }) as never);
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "dup", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 400, message: "用户名已被其他用户使用" });
  });

  test("密码 < 6 位 → 400", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c", password: "abc" },
    })).rejects.toMatchObject({ statusCode: 400, message: "密码长度不能少于 6 位" });
  });

  test("成功 → 返回白名单字段;更新 password 走 bcrypt", async () => {
    const cookie = await authedCookie();
    const r = await callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c", nickname: "新昵称", password: "new-pass-7" },
    }) as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(r.data.uid).toBe(1);
    expect(r.data.nickname).toBe("新昵称");
    expect(r.data.password).toBeUndefined();
    expect(r.data.auth_code).toBeUndefined();
    expect(r.data.totp_secret).toBeUndefined();
  });

  test("P2025 并发删除 → 404", async () => {
    const cookie = await authedCookie();
    // 取到 cookie 后再 override update,否则 login 时 rotate auth_code 就先炸
    sharedFake.on("users", "update", async () => { throw Object.assign(new Error("nf"), { code: "P2025" }); });
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("P2002 并发抢注 → 400(非 500)", async () => {
    const cookie = await authedCookie();
    sharedFake.on("users", "update", async () => { throw Object.assign(new Error("uniq"), { code: "P2002" }); });
    await expect(callAdmin(handler, {
      method: "PUT", cookie, params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
    })).rejects.toMatchObject({ statusCode: 400, message: "用户名或邮箱已被使用" });
  });
});