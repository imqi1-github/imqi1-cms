/**
 * server/api/admin/2fa/devices.get.ts 集成测:
 *  - 未登录 → 401
 *  - 已登录 → 返回字段白名单(id/deviceId/name/ip/location/isp/lastUsedAt/expiresAt/create_time)
 *  - IP 字段为 null/缺失 → location/isp 为空串(不是 null)
 *  - 时间字段经 toISOString 序列化
 *  - 隐私字段(password/auth_code/totp_secret)绝不外泄
 *  - qqwry 不可用 → 单条 device 的 location/isp 为空串,不抛
 *
 * 注:trusted_devices.findMany 替身由 test/helpers/auth-fakes.ts 统一注册(defaultTrustedDeviceSeed),
 * 这里覆盖几个变体来验证白名单/序列化逻辑。
 */
import { describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

// qqwry 是真实 qqwry.ipdb 依赖;这里替换为按 IP 可控的替身
const ipLocationMap = new Map<string, { location: string; isp: string } | null>();
mock.module("#server/utils/qqwry", () => ({
  getIpLocation: async (ip: string) => ipLocationMap.get(ip) ?? null,
  queryIpLocation: async () => null,
}));

const devicesHandler = (await import("#server/api/admin/2fa/devices.get")).default;

describe("admin/2fa/devices.get(信任设备列表)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(devicesHandler, { method: "GET", url: "/api/admin/2fa/devices" }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回白名单字段 + 时间 ISO 字符串", async () => {
    ipLocationMap.set("1.2.3.4", { location: "中国-北京-海淀", isp: "阿里云" });
    const cookie = await loginSessionCookie();
    const r = (await callAdmin(devicesHandler, {
      method: "GET",
      url: "/api/admin/2fa/devices",
      cookie,
    })) as unknown as { devices: Array<Record<string, unknown>> };
    // defaultTrustedDeviceSeed:dev-live(IP 1.2.3.4) + dev-expired(IP null),handler 不过滤过期
    expect(r.devices).toHaveLength(2);
    const dev = r.devices.find(d => d.deviceId === "dev-live")!;
    expect(Object.keys(dev).sort()).toEqual([
      "create_time", "deviceId", "expiresAt", "id", "ip", "isp", "lastUsedAt", "location", "name",
    ]);
    expect(dev.name).toBe("手机");
    expect(dev.ip).toBe("1.2.3.4");
    expect(dev.location).toBe("中国-北京-海淀");
    expect(dev.isp).toBe("阿里云");
    expect(typeof dev.lastUsedAt).toBe("string");
    expect(typeof dev.expiresAt).toBe("string");
    expect(typeof dev.create_time).toBe("string");
  });

  test("device.ip 为 null → location/isp 为空串(null → '' 显式收口,前端无需再判空)", async () => {
    // 把 dev-live 的 IP 清掉,验证白名单兜底
    sharedFake.on("trusted_devices", "findMany", async () => [{
      id: 1, deviceId: "d1", userId: 1, name: "无IP设备", ip: null, expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date(),
    }]);
    const cookie = await loginSessionCookie();
    const r = (await callAdmin(devicesHandler, { method: "GET", url: "/api/admin/2fa/devices", cookie })) as unknown as {
      devices: Array<Record<string, unknown>>;
    };
    expect(r.devices[0]!.ip).toBeNull();
    expect(r.devices[0]!.location).toBe("");
    expect(r.devices[0]!.isp).toBe("");
  });

  test("qqwry 对某 IP 返回 null → location/isp 为空串,不抛", async () => {
    sharedFake.on("trusted_devices", "findMany", async () => [{
      id: 1, deviceId: "d2", userId: 1, name: null, ip: "9.9.9.9", expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date(),
    }]);
    // 9.9.9.9 不在 ipLocationMap → getIpLocation mock 返 null
    const cookie = await loginSessionCookie();
    const r = (await callAdmin(devicesHandler, { method: "GET", url: "/api/admin/2fa/devices", cookie })) as unknown as {
      devices: Array<Record<string, unknown>>;
    };
    expect(r.devices[0]!.location).toBe("");
    expect(r.devices[0]!.isp).toBe("");
  });

  test("响应绝不包含隐私/内部字段(防 ...row 类泄露)", async () => {
    // 替 trusted_devices.findMany 返回包含敏感字段的「完整 row」
    sharedFake.on("trusted_devices", "findMany", async () => [{
      id: 1, deviceId: "d1", userId: 1, name: null, ip: "1.1.1.1",
      // 这些字段绝不能出现在响应里(就算存在)
      secret_token: "SECRET", internal_flag: true, user_agent: "<raw ua>",
      expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date(),
    }]);
    const cookie = await loginSessionCookie();
    const r = (await callAdmin(devicesHandler, { method: "GET", url: "/api/admin/2fa/devices", cookie })) as unknown as {
      devices: Array<Record<string, unknown>>;
    };
    const raw = JSON.stringify(r);
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("internal_flag");
    expect(raw).not.toContain("user_agent");
    expect(raw).not.toContain("userId"); // userId 也不暴露给前端
  });

  test("去重 IP 后并发查 qqwry(同 IP 多设备只查一次)", async () => {
    let qqwryCalls = 0;
    ipLocationMap.set("1.1.1.1", { location: "中国-北京", isp: "阿里云" });
    mock.module("#server/utils/qqwry", () => ({
      getIpLocation: async (ip: string) => { qqwryCalls++; return ipLocationMap.get(ip) ?? null; },
      queryIpLocation: async () => null,
    }));
    sharedFake.on("trusted_devices", "findMany", async () => [
      { id: 1, deviceId: "d1", userId: 1, name: "A", ip: "1.1.1.1", expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date() },
      { id: 2, deviceId: "d2", userId: 1, name: "B", ip: "1.1.1.1", expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date() },
      { id: 3, deviceId: "d3", userId: 1, name: "C", ip: "2.2.2.2", expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date() },
    ]);
    const cookie = await loginSessionCookie();
    await callAdmin(devicesHandler, { method: "GET", url: "/api/admin/2fa/devices", cookie });
    // 2 个独立 IP → 2 次查 qqwry(同 IP 去重)
    expect(qqwryCalls).toBe(2);
  });
});