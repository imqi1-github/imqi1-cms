/**
 * server/api/admin/system-info.get.ts 集成测:
 *  - 已有 admin-system-get.test.ts 基础覆盖;本文件补响应结构完整断言 + 异常分支
 *  - 内容附件大小求和、数据库版本不抛
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

mock.module("#server/utils/qqwry", () => ({ getIpLocation: async () => ({ location: "x", isp: "y" }) }));

const attachments: Array<Record<string, unknown>> = [];

beforeEach(() => {
  attachments.length = 0;
  attachments.push({ aid: 1, metadata: { size: 1024, width: 10, height: 10, format: "png" } });
  attachments.push({ aid: 2, metadata: { size: 2048, width: 20, height: 20, format: "png" } });
  attachments.push({ aid: 3, metadata: null }); // 缺 metadata → size=0
  sharedFake.on("attachments", "findMany", async () => attachments.map(a => ({ ...a })));
  sharedFake.on("attachments", "count", async () => attachments.length);
});

const handler = (await import("#server/api/admin/system-info.get")).default;

describe("admin/system-info.get(系统信息)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("成功 → node/platform/db/attachments 全字段返回", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as {
      nodeVersion: string; platform: string; arch: string;
      database: { version: string };
      attachments: { count: number; totalSize: number };
    };
    expect(typeof r.nodeVersion).toBe("string");
    expect(typeof r.platform).toBe("string");
    expect(typeof r.database.version).toBe("string");
    expect(r.attachments.count).toBe(3);
    expect(r.attachments.totalSize).toBe(1024 + 2048); // 损坏的 metadata 计入 0
  });

  test("attachments 空 → totalSize = 0", async () => {
    attachments.length = 0;
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { attachments: { count: number; totalSize: number } };
    expect(r.attachments.count).toBe(0);
    expect(r.attachments.totalSize).toBe(0);
  });

  test("DB 异常 → 500(泛化文案)", async () => {
    sharedFake.on("attachments", "findMany", async () => { throw new Error("db down"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 500 });
  });
});