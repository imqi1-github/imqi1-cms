/**
 * admin/users/[id].put 补测:
 *  - 类型校验:非字符串 nickname/avatar/password → 400
 *  - 必填 name/mail 非空 → 400
 *  - 邮箱已被其他用户占用 → 400
 *  - 密码长度 < 6 → 400
 *  - IDOR 防御:uid !== 会话用户 → 403
 *  - P2025 / P2002 兜底
 */
import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, loginSessionCookie, resetUsers, registerAuthFakes, getUserRow } from "#test/helpers/auth-fakes";
import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/users/[id].put")).default;

beforeEach(() => resetUsers());

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callPut(opts: { id?: string; body?: Record<string, unknown> }) {
  return callAdmin(handler, {
    method: "PUT",
    params: { id: opts.id ?? "1" },
    body: { csrfToken: CSRF_TOKEN, ...opts.body },
    cookie: await cookie(),
  });
}

describe("admin/users/[id].put 类型校验", () => {
  test("nickname 非字符串 → 400", async () => {
    await expect(callPut({ body: { name: "admin", mail: "a@b.c", nickname: 123 } })).rejects.toMatchObject({ statusCode: 400, message: "昵称格式错误" });
  });

  test("avatar 非字符串 → 400", async () => {
    await expect(callPut({ body: { name: "admin", mail: "a@b.c", avatar: ["url"] } })).rejects.toMatchObject({ statusCode: 400, message: "头像格式错误" });
  });

  test("password 非字符串 → 400", async () => {
    await expect(callPut({ body: { name: "admin", mail: "a@b.c", password: 123456 } })).rejects.toMatchObject({ statusCode: 400, message: "密码格式错误" });
  });

  test("nickname=null 允许(显式清空)", async () => {
    const r = await callPut({ body: { name: "admin", mail: "a@b.c", nickname: null } });
    expect((r as { success: boolean }).success).toBe(true);
  });

  test("avatar=null 允许(显式清空)", async () => {
    const r = await callPut({ body: { name: "admin", mail: "a@b.c", avatar: null } });
    expect((r as { success: boolean }).success).toBe(true);
  });
});

describe("admin/users/[id].put 必填字段", () => {
  test("name 纯空白 → 400", async () => {
    await expect(callPut({ body: { name: "   ", mail: "a@b.c" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("mail 纯空白 → 400", async () => {
    await expect(callPut({ body: { name: "admin", mail: "" } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/users/[id].put 唯一性 + IDOR", () => {
  test("mail 被另一个用户占用 → 400(不破坏 getUser 的会话查询)", async () => {
    // 完整 findUnique:必须同时处理 getUser 的 uid+select 查询,以及业务查重
    sharedFake.on("users", "findUnique", async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
      // getUser 查自身:where.uid=session.userId
      if (typeof where.uid === "number") {
        const row = getUserRow(where.uid);
        if (!row) return null;
        if (select) {
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(select)) out[k] = row[k as keyof typeof row];
          return out;
        }
        return { ...row };
      }
      // 业务查 mail 唯一性
      if (where.mail === "taken@x.com") {
        return { uid: 2, name: "u2", mail: "taken@x.com" } as never;
      }
      // 业务查 name 唯一性
      if (where.name) {
        const row = getUserRow(1);
        if (row && row.name === where.name) return { ...row };
        return null;
      }
      return null;
    });
    await expect(callPut({ body: { name: "admin", mail: "taken@x.com" } })).rejects.toMatchObject({ statusCode: 400, message: "邮箱已被其他用户使用" });
  });

  test("name 被另一个用户占用 → 400", async () => {
    sharedFake.on("users", "findUnique", async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
      if (typeof where.uid === "number") {
        const row = getUserRow(where.uid);
        if (!row) return null;
        if (select) {
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(select)) out[k] = row[k as keyof typeof row];
          return out;
        }
        return { ...row };
      }
      if (where.name === "taken") {
        return { uid: 2, name: "taken", mail: "u2@x.com" } as never;
      }
      if (where.mail) {
        const row = getUserRow(1);
        if (row && row.mail === where.mail) return { ...row };
        return null;
      }
      return null;
    });
    await expect(callPut({ body: { name: "taken", mail: "a@b.c" } })).rejects.toMatchObject({ statusCode: 400, message: "用户名已被其他用户使用" });
  });

  test("会话 uid=1 但 URL id=2 → 403 IDOR(先于唯一性检查)", async () => {
    await expect(callPut({ id: "2", body: { name: "admin", mail: "a@b.c" } })).rejects.toMatchObject({ statusCode: 403, message: "无权操作该账户" });
  });
});

describe("admin/users/[id].put 密码修改", () => {
  test("password 长度 < 6 → 400", async () => {
    await expect(callPut({ body: { name: "admin", mail: "a@b.c", password: "123" } })).rejects.toMatchObject({ statusCode: 400, message: "密码长度不能少于 6 位" });
  });

  test("password = '' 视为未提供,不更新", async () => {
    const r = await callPut({ body: { name: "admin", mail: "a@b.c", password: "" } }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("password 不返回在响应里", async () => {
    const r = (await callPut({ body: { name: "admin", mail: "a@b.c", password: "new-password-123" } })) as { data: Record<string, unknown> };
    expect(r.data.password).toBeUndefined();
  });
});

describe("admin/users/[id].put 并发兜底", () => {
  // 每个测试前重置所有假件,避免前一个测试覆盖的 users.findUnique/update 影响
  test("update 时记录被并发删(P2025)→ 404 而非 500", async () => {
    registerAuthFakes();
    // 只在 update 含 name 字段时抛(避免 setSession 在 loginSessionCookie 阶段踩到)
    sharedFake.on("users", "update", async ({ data }: { data: Record<string, unknown> }) => {
      if ("name" in data || "nickname" in data) {
        throw Object.assign(new Error("P2025"), { code: "P2025" });
      }
      const row = getUserRow(1);
      if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
      Object.assign(row, data);
      return { ...row };
    });
    const session = await loginSessionCookie();
    const cookieStr = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
      cookie: cookieStr,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("并发唯一约束冲突(P2002)→ 400 而非 500", async () => {
    registerAuthFakes();
    sharedFake.on("users", "update", async ({ data }: { data: Record<string, unknown> }) => {
      if ("name" in data || "nickname" in data) {
        throw Object.assign(new Error("P2002"), { code: "P2002" });
      }
      const row = getUserRow(1);
      if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
      Object.assign(row, data);
      return { ...row };
    });
    const session = await loginSessionCookie();
    const cookieStr = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
      cookie: cookieStr,
    })).rejects.toMatchObject({ statusCode: 400, message: "用户名或邮箱已被使用" });
  });

  test("其它未知错误 → 500 而非泄漏 error.message", async () => {
    registerAuthFakes();
    sharedFake.on("users", "update", async ({ data }: { data: Record<string, unknown> }) => {
      if ("name" in data || "nickname" in data) {
        throw new Error("raw db error message 敏感");
      }
      const row = getUserRow(1);
      if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
      Object.assign(row, data);
      return { ...row };
    });
    const session = await loginSessionCookie();
    const cookieStr = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
      cookie: cookieStr,
    })).rejects.toMatchObject({ statusCode: 500 });
    try {
      await callAdmin(handler, {
        method: "PUT",
        params: { id: "1" },
        body: { csrfToken: CSRF_TOKEN, name: "admin", mail: "a@b.c" },
        cookie: cookieStr,
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});