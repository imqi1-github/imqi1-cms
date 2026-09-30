import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { defaultTrustedDeviceSeed, resetTrustedDevices } from "#test/helpers/auth-fakes";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();
// qqwry IP 库在测试环境不可依赖
mock.module("#server/utils/qqwry", () => ({ getIpLocation: async () => ({ location: "中国-辽宁-沈阳", isp: "联通" }) }));

const listHandler = (await import("#server/api/admin/2fa/devices.get")).default;
const renameHandler = (await import("#server/api/admin/2fa/devices/[id].put")).default;
const revokeHandler = (await import("#server/api/admin/2fa/devices/[id].delete")).default;

beforeEach(() => resetTrustedDevices(defaultTrustedDeviceSeed()));

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/2fa/devices.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(listHandler, {})).rejects.toMatchObject({ statusCode: 401 });
  });

  test("列出本账户设备:附归属地,时间 ISO 化,白名单字段", async () => {
    const r = (await callAdmin(listHandler, { method: "GET", cookie: await loginSessionCookie() })) as { devices: Array<Record<string, unknown>> };
    expect(r.devices).toHaveLength(2);
    const withIp = r.devices.find(d => d.deviceId === "dev-live")!;
    expect(withIp.location).toBe("中国-辽宁-沈阳");
    expect(withIp.isp).toBe("联通");
    expect(typeof withIp.lastUsedAt).toBe("string");
    expect(Object.keys(withIp).sort()).toEqual(["create_time", "deviceId", "expiresAt", "id", "ip", "isp", "lastUsedAt", "location", "name"]);
    // 无 IP 的设备归属地为空串
    expect(r.devices.find(d => d.deviceId === "dev-expired")!.location).toBe("");
  });
});

describe("admin/2fa/devices/[id].put(重命名)", () => {
  test("CSRF 缺失 → 403;非法 id → 400;不存在/非本人 → 404", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(renameHandler, { method: "PUT", params: { id: "1" }, cookie: session, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(renameHandler, { method: "PUT", params: { id: "abc" }, cookie: await cookie(), body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(renameHandler, { method: "PUT", params: { id: "999" }, cookie: await cookie(), body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("名称超 100 字 → 400;非字符串 → 400;改名成功", async () => {
    const c = await cookie();
    await expect(callAdmin(renameHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { name: "长".repeat(101), csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(renameHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { name: 123, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });

    const r = (await callAdmin(renameHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { name: "  我的手机  ", csrfToken: CSRF_TOKEN } })) as { success: boolean; name: string };
    expect(r.success).toBe(true);
    expect(r.name).toBe("我的手机");
    // 改名反映在列表里
    const list = (await callAdmin(listHandler, { method: "GET", cookie: await loginSessionCookie() })) as { devices: Array<{ id: number; name: string }> };
    expect(list.devices.find(d => d.id === 1)?.name).toBe("我的手机");
  });

  test("空串/缺省视为清空名称(回 null)", async () => {
    const r = (await callAdmin(renameHandler, { method: "PUT", params: { id: "1" }, cookie: await cookie(), body: { name: "", csrfToken: CSRF_TOKEN } })) as { name: string | null };
    expect(r.name).toBeNull();
  });
});

describe("admin/2fa/devices/[id].delete(撤回)", () => {
  test("CSRF 走 header:缺失 → 403;成功撤回;重复 → 404", async () => {
    const c = await cookie();
    await expect(callAdmin(revokeHandler, { method: "DELETE", params: { id: "1" }, cookie: c })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(revokeHandler, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).resolves.toMatchObject({ success: true });
    await expect(callAdmin(revokeHandler, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("撤回后列表少一台;非法 id → 400", async () => {
    const c = await cookie();
    await expect(callAdmin(revokeHandler, { method: "DELETE", params: { id: "0" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await callAdmin(revokeHandler, { method: "DELETE", params: { id: "2" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } });
    const list = (await callAdmin(listHandler, { method: "GET", cookie: await loginSessionCookie() })) as { devices: unknown[] };
    expect(list.devices).toHaveLength(1);
  });
});
