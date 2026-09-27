/**
 * server/api/admin/2fa/devices/[id].delete.ts 集成测:
 *  - 未登录 → 401
 *  - CSRF 走 header(x-csrf-token),缺失/不匹配 → 403
 *  - id 缺省/非正整数 → 400
 *  - revokeTrustedDevice 返 0(不存在/不属于当前用户)→ 404
 *  - 成功 → {success:true}
 *
 * 注:与 [id].put 区分 CSRF 来源(header vs body);两条都得有,跨文件互不污染。
 */
import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

const deleteHandler = (await import("#server/api/admin/2fa/devices/[id].delete")).default;

async function withCsrfCookie(): Promise<string> {
  const session = await loginSessionCookie();
  return `${session}; csrf_token=${CSRF_TOKEN}`;
}

describe("admin/2fa/devices/[id].delete(撤回信任设备)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/1",
      params: { id: "1" },
      cookie: `csrf_token=${CSRF_TOKEN}`,
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      // 没带 x-csrf-token header
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("CSRF 不匹配 → 403", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "x-csrf-token": "wrong-token-xxxxxxxxxxxxxxxxxx" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/",
      cookie, params: {},
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/0",
      cookie, params: { id: "0" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非法字符 → 400", async () => {
    const cookie = await withCsrfCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/foo",
      cookie, params: { id: "foo" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("revokeTrustedDevice 返 0(不存在)→ 404", async () => {
    sharedFake.on("trusted_devices", "deleteMany", async () => ({ count: 0 }));
    const cookie = await withCsrfCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/999",
      cookie, params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功撤回 → {success:true}", async () => {
    sharedFake.on("trusted_devices", "deleteMany", async () => ({ count: 1 }));
    const cookie = await withCsrfCookie();
    const r = (await callAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/2fa/devices/1",
      cookie, params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })) as unknown as { success: boolean };
    expect(r).toEqual({ success: true });
  });
});