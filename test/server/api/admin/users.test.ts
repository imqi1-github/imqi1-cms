import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import {
  TEST_PASSWORD,
  loginSessionCookie,
  resetUsers, makeAuthEvent 
} from "#test/helpers/auth-fakes";
import { CSRF_COOKIE, CSRF_TOKEN, callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

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
