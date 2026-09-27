/**
 * server/api/admin/2fa/devices.get.ts:
 *  - 未登录 → 401
 *  - 响应字段白名单:{id, deviceId, name, ip, location, isp, lastUsedAt, expiresAt, create_time}
 *  - 禁 ...row(userId/updated_at 等内部列不外泄)
 *  - 空 IP 跳过 getIpLocation,location/isp 留空
 *  - 唯一 IP 去重 → 只查一次 qqwry
 *  - 日期字段 toISOString 输出
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

let getUserImpl: (e: unknown) => Promise<unknown>;
let listDevicesImpl: (uid: number) => Promise<unknown[]>;
let ipLocationCalls: string[];

beforeEach(() => {
  getUserImpl = async () => ({ uid: 1 });
  listDevicesImpl = async () => [];
  ipLocationCalls = [];
  mock.module("#server/lib/auth", () => ({
    getUser: async (e: unknown) => getUserImpl(e),
  }));
  mock.module("#server/utils/trusted-device", () => ({
    listTrustedDevices: async (uid: number) => listDevicesImpl(uid),
  }));
  mock.module("#server/utils/qqwry", () => ({
    getIpLocation: async (ip: string) => {
      ipLocationCalls.push(ip);
      // 根据 ip 简单区分返回(测试不依赖 qqwry 真实数据)
      if (ip.startsWith("1.1")) return { location: "北京", isp: "电信" };
      return { location: "未知", isp: "" };
    },
  }));
});

const { default: devicesHandler } = await import("~/../server/api/admin/2fa/devices.get");

function callList(): Promise<unknown> {
  return (devicesHandler as (e: never) => Promise<unknown>)({} as never);
}

describe("admin 2fa/devices:get 路由", () => {
  test("未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(callList()).rejects.toMatchObject({ statusCode: 401 });
  });

  test("无设备 → { devices: [] }", async () => {
    listDevicesImpl = async () => [];
    const res = await callList() as { devices: unknown[] };
    expect(res.devices).toEqual([]);
  });

  test("响应字段精确白名单(禁 ...row):不含 userId/updated_at 等内部列", async () => {
    listDevicesImpl = async () => [
      {
        id: 1, deviceId: "dev-1", name: "手机", ip: "1.1.1.1",
        lastUsedAt: new Date("2026-01-01T00:00:00Z"),
        expiresAt: new Date("2026-12-31T00:00:00Z"),
        create_time: new Date("2025-06-01T00:00:00Z"),
        // 内部字段不应外泄
        userId: 1, updated_at: new Date(),
      },
    ];
    const res = await callList() as { devices: Array<Record<string, unknown>> };
    expect(res.devices).toHaveLength(1);
    const d = res.devices[0]!;
    const keys = Object.keys(d).sort();
    expect(keys).toEqual([
      "create_time", "deviceId", "expiresAt", "id", "ip", "isp",
      "lastUsedAt", "location", "name",
    ]);
    // 内部列不在
    expect("userId" in d).toBe(false);
    expect("updated_at" in d).toBe(false);
  });

  test("日期字段 toISOString 格式", async () => {
    listDevicesImpl = async () => [
      {
        id: 1, deviceId: "d", name: null, ip: "1.1.1.1",
        lastUsedAt: new Date("2026-03-15T08:30:00Z"),
        expiresAt: new Date("2027-03-15T08:30:00Z"),
        create_time: new Date("2025-03-15T08:30:00Z"),
      },
    ];
    const res = await callList() as { devices: Array<Record<string, string>> };
    const d = res.devices[0]!;
    expect(d.lastUsedAt).toBe("2026-03-15T08:30:00.000Z");
    expect(d.expiresAt).toBe("2027-03-15T08:30:00.000Z");
    expect(d.create_time).toBe("2025-03-15T08:30:00.000Z");
  });

  test("空 IP 设备 → location/isp 留空字符串,不调 getIpLocation", async () => {
    listDevicesImpl = async () => [
      {
        id: 1, deviceId: "d", name: "x", ip: null,
        lastUsedAt: new Date(), expiresAt: new Date(), create_time: new Date(),
      },
    ];
    const res = await callList() as { devices: Array<Record<string, unknown>> };
    expect(res.devices[0]!.ip).toBeNull();
    expect(res.devices[0]!.location).toBe("");
    expect(res.devices[0]!.isp).toBe("");
    expect(ipLocationCalls).toHaveLength(0); // 空 IP 跳过
  });

  test("多个同 IP 设备 → getIpLocation 只调一次(去重)", async () => {
    listDevicesImpl = async () => [
      { id: 1, deviceId: "d1", name: "x", ip: "1.1.1.1",
        lastUsedAt: new Date(), expiresAt: new Date(), create_time: new Date() },
      { id: 2, deviceId: "d2", name: "y", ip: "1.1.1.1",
        lastUsedAt: new Date(), expiresAt: new Date(), create_time: new Date() },
      { id: 3, deviceId: "d3", name: "z", ip: "2.2.2.2",
        lastUsedAt: new Date(), expiresAt: new Date(), create_time: new Date() },
    ];
    const res = await callList() as { devices: Array<Record<string, string>> };
    expect(res.devices).toHaveLength(3);
    // getIpLocation 被调 2 次(2 个唯一 IP)
    expect(ipLocationCalls.sort()).toEqual(["1.1.1.1", "2.2.2.2"]);
  });

  test("过期设备(handler 不过滤,前端决定显示)→ 仍返回,lastUsedAt/expiresAt 是 ISO", async () => {
    listDevicesImpl = async () => [
      {
        id: 99, deviceId: "expired", name: null, ip: "1.1.1.1",
        lastUsedAt: new Date("2024-01-01T00:00:00Z"),
        expiresAt: new Date("2024-12-31T00:00:00Z"), // 过期
        create_time: new Date("2023-01-01T00:00:00Z"),
      },
    ];
    const res = await callList() as { devices: Array<Record<string, string>> };
    expect(res.devices).toHaveLength(1);
    expect(res.devices[0]!.expiresAt).toMatch(/^2024-12-31/);
  });
});