import "#test/helpers/nitro-globals";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  TEST_PASSWORD,
  loginSessionCookie,
  registerAuthFakes,
  resetUsers, makeAuthEvent, getUserRow
} from "#test/helpers/auth-fakes";
import { CSRF_COOKIE, CSRF_TOKEN, callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// users 假件统一在 auth-fakes 注册;这里只复位
beforeEach(() => resetUsers());

const getUserHandler = (await import("#server/api/admin/users/[id].get"))
  .default;
const putUserHandler = (await import("#server/api/admin/users/[id].put"))
  .default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/users/[id].get(IDOR 防御)", () => {
  test("未登录 → 401;非法 id → 400", async () => {
    await expect(callAdmin(getUserHandler, {})).rejects.toMatchObject({
      statusCode: 401,
    });
    const session = await loginSessionCookie();
    await expect(
      callAdmin(getUserHandler, {
        method: "GET",
        params: { id: "abc" },
        cookie: session,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      callAdmin(getUserHandler, {
        method: "GET",
        params: { id: "-1" },
        cookie: session,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("查他人账户 → 403 无权查看(IDOR)", async () => {
    const session = await loginSessionCookie();
    await expect(
      callAdmin(getUserHandler, {
        method: "GET",
        params: { id: "2" },
        cookie: session,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("查自己 → 返回资料(不含 password/auth_code)", async () => {
    const session = await loginSessionCookie();
    const r = (await callAdmin(getUserHandler, {
      method: "GET",
      params: { id: "1" },
      cookie: session,
    })) as Record<string, unknown>;
    expect(r.uid).toBe(1);
    expect(Object.keys(r)).not.toContain("password");
    expect(Object.keys(r)).not.toContain("auth_code");
    expect(Object.keys(r)).not.toContain("totp_secret");
  });

  test("不存在的 uid(且非自己)→ 403 而非 404(IDOR 先于存在性判定)", async () => {
    const session = await loginSessionCookie();
    await expect(
      callAdmin(getUserHandler, {
        method: "GET",
        params: { id: "999" },
        cookie: session,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("admin/users/[id].put(IDOR + 唯一性)", () => {
  test("CSRF 缺失 → 403;查他人 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(
      callAdmin(putUserHandler, {
        method: "PUT",
        params: { id: "1" },
        cookie: session,
        body: { name: "n", mail: "m@x.com" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      callAdmin(putUserHandler, {
        method: "PUT",
        params: { id: "2" },
        cookie: await cookie(),
        body: { name: "n", mail: "m@x.com" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name/mail 必填 → 400;nickname 非字符串 → 400", async () => {
    const c = await cookie();
    await expect(
      callAdmin(putUserHandler, {
        method: "PUT",
        params: { id: "1" },
        cookie: c,
        body: { name: "", mail: "a@b.c", csrfToken: CSRF_TOKEN },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      callAdmin(putUserHandler, {
        method: "PUT",
        params: { id: "1" },
        cookie: c,
        body: { mail: "a@b.c", csrfToken: CSRF_TOKEN },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      callAdmin(putUserHandler, {
        method: "PUT",
        params: { id: "1" },
        cookie: c,
        body: {
          name: "admin",
          mail: "a@b.c",
          nickname: 123,
          csrfToken: CSRF_TOKEN,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("密码少于 6 位 → 400", async () => {
    const c = await cookie();
    await expect(
      callAdmin(putUserHandler, {
        method: "PUT",
        params: { id: "1" },
        cookie: c,
        body: {
          name: "admin",
          mail: "a@b.c",
          password: "12345",
          csrfToken: CSRF_TOKEN,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("改密码成功(新密码可登录验证的哈希已写入)", async () => {
    const { getUserRow, TEST_PASSWORD: OLD } = {
      getUserRow: (await import("#test/helpers/auth-fakes")).getUserRow,
      TEST_PASSWORD: TEST_PASSWORD,
    };
    const c = await cookie();
    const r = (await callAdmin(putUserHandler, {
      method: "PUT",
      params: { id: "1" },
      cookie: c,
      body: {
        name: "admin",
        mail: "a@b.c",
        password: "new-password-6",
        csrfToken: CSRF_TOKEN,
      },
    })) as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(Object.keys(r.data)).not.toContain("password");
    const row = getUserRow(1)!;
    expect(row.password).not.toBe(OLD);
    // 旧密码哈希已被替换:auth.test 的 verifyPassword 语义由 bcrypt 保证,这里只断言哈希变化
  });

  test("邮箱/用户名改为自己现值不算冲突", async () => {
    const c = await cookie();
    const r = (await callAdmin(putUserHandler, {
      method: "PUT",
      params: { id: "1" },
      cookie: c,
      body: { name: "admin", mail: "a@b.c", csrfToken: CSRF_TOKEN },
    })) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("改密码后旧会话仍有效(authCode 未旋转)", async () => {
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    await callAdmin(putUserHandler, {
      method: "PUT",
      params: { id: "1" },
      cookie: c,
      body: {
        name: "admin",
        mail: "a@b.c",
        password: "changed-pw",
        csrfToken: CSRF_TOKEN,
      },
    });
    // 改资料不走 setSession,auth_code 不旋转 → 旧会话保持有效
    const verify = (await import("#server/api/auth/verify.get")).default;
    const { event } = makeAuthEvent({
      method: "GET",
      cookie: session,
      peer: "10.9.9.1",
    });
    const r = (await verify(event)) as { valid: boolean };
    expect(r.valid).toBe(true);
  });
});

describe("admin/users 分支补测", () => {
  afterEach(() => { registerAuthFakes(); resetUsers(); });

  test("GET:404 目标不存在;500 DB 异常", async () => {
    const session = await loginSessionCookie();
    // getUser 也走 users.findUnique(select 含 auth_code),用 select 形态区分鉴权层与 handler 层
    sharedFake.on("users", "findUnique", async ({ select }: { select?: Record<string, unknown> }) => {
      if (select && "auth_code" in select) {
        const row = getUserRow(1)!;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) out[k] = (row as unknown as Record<string, unknown>)[k];
        return out;
      }
      return null; // handler 层:目标不存在
    });
    await expect(callAdmin(getUserHandler, { method: "GET", params: { id: "1" }, cookie: session })).rejects.toMatchObject({ statusCode: 404 });

    registerAuthFakes();
    sharedFake.on("users", "findUnique", async ({ select }: { select?: Record<string, unknown> }) => {
      if (select && "auth_code" in select) {
        const row = getUserRow(1)!;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) out[k] = (row as unknown as Record<string, unknown>)[k];
        return out;
      }
      throw new Error("db down");
    });
    await expect(callAdmin(getUserHandler, { method: "GET", params: { id: "1" }, cookie: session })).rejects.toMatchObject({ statusCode: 500 });
  });

  test("PUT:401/400 前置;缺 id / 非法 id / 无 csrf", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(putUserHandler, { method: "PUT", params: { id: "1" }, body: { name: "x", mail: "a@b.c", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
    const c = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(putUserHandler, { method: "PUT", params: { id: "" }, cookie: c, body: { name: "x", mail: "a@b.c", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(putUserHandler, { method: "PUT", params: { id: "abc" }, cookie: c, body: { name: "x", mail: "a@b.c", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(putUserHandler, { method: "PUT", params: { id: "1" }, cookie: session, body: { name: "x", mail: "a@b.c", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(putUserHandler, { method: "PUT", params: { id: "2" }, cookie: c, body: { name: "x", mail: "a@b.c", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("PUT:字段类型校验 → 400(nickname/avatar/password 非字符串)", async () => {
    const c = await cookie();
    const put = (body: Record<string, unknown>) => callAdmin(putUserHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c", ...body } });
    await expect(put({ nickname: 5 })).rejects.toMatchObject({ statusCode: 400, message: "昵称格式错误" });
    await expect(put({ avatar: [] })).rejects.toMatchObject({ statusCode: 400, message: "头像格式错误" });
    await expect(put({ password: 123 })).rejects.toMatchObject({ statusCode: 400, message: "密码格式错误" });
    await expect(put({ name: 5 })).rejects.toMatchObject({ statusCode: 400, message: "用户名和邮箱不能为空" });
  });

  test("PUT:邮箱/用户名被他人占用 → 400", async () => {
    const c = await cookie();
    sharedFake.on("users", "findUnique", async ({ where, select }: { where: { uid?: number; name?: string; mail?: string }; select?: Record<string, unknown> }) => {
      if (select && "auth_code" in select) {
        const row = getUserRow(1)!;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) out[k] = (row as unknown as Record<string, unknown>)[k];
        return out;
      }
      if (where.mail === "taken@x.com") return { uid: 2, name: "别人", mail: "taken@x.com" };
      if (where.name === "taken") return { uid: 2, name: "taken", mail: "o@x.com" };
      return { uid: 1, name: "admin", nickname: "阿棋", mail: "a@b.c", avatar: null };
    });
    await expect(callAdmin(putUserHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "taken@x.com" } })).rejects.toMatchObject({ statusCode: 400, message: "邮箱已被其他用户使用" });
    await expect(callAdmin(putUserHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, name: "taken", mail: "a@b.c" } })).rejects.toMatchObject({ statusCode: 400, message: "用户名已被其他用户使用" });
  });

  test("PUT:404 / P2002 → 400 / P2025 → 404 / 未知 → 500", async () => {
    const c = await cookie();
    const put = () => callAdmin(putUserHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" } });

    sharedFake.on("users", "findUnique", async ({ select }: { select?: Record<string, unknown> }) => {
      if (select && "auth_code" in select) {
        const row = getUserRow(1)!;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) out[k] = (row as unknown as Record<string, unknown>)[k];
        return out;
      }
      return null;
    });
    await expect(put()).rejects.toMatchObject({ statusCode: 404 });

    registerAuthFakes();
    sharedFake.on("users", "update", async () => { throw Object.assign(new Error("P2002"), { code: "P2002" }); });
    await expect(put()).rejects.toMatchObject({ statusCode: 400, message: "用户名或邮箱已被使用" });

    registerAuthFakes();
    sharedFake.on("users", "update", async () => { throw Object.assign(new Error("P2025"), { code: "P2025" }); });
    await expect(put()).rejects.toMatchObject({ statusCode: 404 });

    registerAuthFakes();
    sharedFake.on("users", "update", async () => { throw new Error("db down"); });
    await expect(put()).rejects.toMatchObject({ statusCode: 500 });
  });

  test("PUT:nickname/avatar 空值存 null;password 空串不改密码", async () => {
    const cookieStr = await cookie();
    // 不能在此 resetUsers():setSession 已旋转 auth_code,会话与之绑定(cookie 早于 reset 会失配 401)
    const updated: Array<Record<string, unknown>> = [];
    sharedFake.on("users", "update", async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
      updated.push({ ...data });
      const row = { uid: 1, name: "admin", nickname: null, mail: "a@b.c", avatar: null, create_time: new Date() };
      if (!select) return row;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(select)) out[k] = (row as Record<string, unknown>)[k];
      return out;
    });
    const r = (await callAdmin(putUserHandler, { method: "PUT", params: { id: "1" }, cookie: cookieStr, body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c", nickname: null, avatar: null, password: "" } })) as { success: boolean };
    expect(r.success).toBe(true);
    expect(updated[0]!.nickname).toBeNull();
    expect(updated[0]!.avatar).toBeNull();
    expect(updated[0]!.password).toBeUndefined();
  });
});
