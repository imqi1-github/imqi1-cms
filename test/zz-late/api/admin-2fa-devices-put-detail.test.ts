/**
 * server/api/admin/2fa/devices/[id].put.ts 集成测:
 *  - 未登录 → 401
 *  - id 缺省/非正整数 → 400
 *  - CSRF 校验失败(body csrfToken 不匹配存储的 cookie)→ 403
 *  - name 长度 >100 → 400
 *  - name 非法类型(数字/对象)→ 400
 *  - name 是空串 → 视为清空(写库 null)
 *  - name 是 null/undefined → 视为清空
 *  - renameTrustedDevice 返 0(id 不存在或不属于当前用户)→ 404
 *  - 成功 → 返回 {success:true, name}
 */
import { beforeEach, describe, expect, test } from "bun:test";

import {
  CSRF_TOKEN, callAdmin, loginSessionCookie,
} from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

const renameHandler = (await import("#server/api/admin/2fa/devices/[id].put")).default;

const sharedFakeState: { row: { id: number; userId: number; name: string } } = { row: { id: 1, userId: 1, name: "原名" } };

beforeEach(() => {
  sharedFakeState.row = { id: 1, userId: 1, name: "原名" };
  sharedFake.on("trusted_devices", "updateMany", async ({ where, data }: {
    where: { id: number; userId: number }; data: { name: string | null };
  }) => {
    if (where.id === 1 && where.userId === 1) {
      Object.assign(sharedFakeState.row, data);
      return { count: 1 };
    }
    void data;
    return { count: 0 };
  });
});

async function withCsrfCookie(): Promise<string> {
  const session = await loginSessionCookie();
  return `${session}; csrf_token=${CSRF_TOKEN}`;
}

function bodyPatch(name: unknown) {
  return { csrfToken: CSRF_TOKEN, name };
}

describe("admin/2fa/devices/[id].put(重命名设备)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      params: { id: "1" },
      headers: { "content-type": "application/json" },
      cookie: `csrf_token=${CSRF_TOKEN}`,
      body: bodyPatch("新名"),
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("id 缺省 → 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/",
      cookie, params: {},
      headers: { "content-type": "application/json" },
      body: bodyPatch("新名"),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/0",
      cookie, params: { id: "0" },
      headers: { "content-type": "application/json" },
      body: bodyPatch("新名"),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非法字符 → 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/abc",
      cookie, params: { id: "abc" },
      headers: { "content-type": "application/json" },
      body: bodyPatch("新名"),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 缺失(body 没 csrfToken)→ 403", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: { name: "新名" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("CSRF 不匹配 → 403", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: { csrfToken: "wrong-token-xxxxxxxxxxxxxxxxxx", name: "新名" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name 超长(>100)→ 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: bodyPatch("a".repeat(101)),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 非法类型(数字)→ 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: bodyPatch(123),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 非法类型(对象)→ 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: bodyPatch({ x: 1 }),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 空串 → 写库 null(视为清空)", async () => {
    const cookie = await withCsrfCookie();
    const r = (await callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: bodyPatch(""),
    })) as unknown as { success: boolean; name: string | null };
    expect(r.success).toBe(true);
    expect(r.name).toBeNull();
    expect(sharedFakeState.row.name).toBeNull();
  });

  test("name null → 写库 null(显式清空)", async () => {
    const cookie = await withCsrfCookie();
    const r = (await callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: bodyPatch(null),
    })) as unknown as { success: boolean; name: string | null };
    expect(r.success).toBe(true);
    expect(r.name).toBeNull();
  });

  test("name 是空白字符串 → trim 后为空 → null", async () => {
    const cookie = await withCsrfCookie();
    const r = (await callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: bodyPatch("   "),
    })) as unknown as { name: string | null };
    expect(r.name).toBeNull();
  });

  test("name 正常字符串 → 写库 + 响应(已 trim)", async () => {
    const cookie = await withCsrfCookie();
    const r = (await callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "content-type": "application/json" },
      body: bodyPatch("  新名  "),
    })) as unknown as { success: boolean; name: string };
    expect(r.success).toBe(true);
    expect(r.name).toBe("新名");
    expect(sharedFakeState.row.name).toBe("新名");
  });

  test("renameTrustedDevice 返 0(id 不存在/不属于当前用户)→ 404", async () => {
    sharedFake.on("trusted_devices", "updateMany", async () => ({ count: 0 }));
    const cookie = await withCsrfCookie();
    await expect(callAdmin(renameHandler, {
      method: "PUT", url: "/api/admin/2fa/devices/999",
      cookie, params: { id: "999" },
      headers: { "content-type": "application/json" },
      body: bodyPatch("新名"),
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});