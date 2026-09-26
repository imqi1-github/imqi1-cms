import { beforeEach, describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

// mock qqwry(避免依赖真实 ipdb 文件;不影响 two-factor-devices.test.ts 的同名 mock,因为后续文件会再次覆盖)
mock.module("#server/utils/qqwry", () => ({
  getIpLocation: async (ip: string) => ({ location: `测试-${ip}`, isp: "测试运营商" }),
}));

const systemInfoHandler = (await import("#server/api/admin/system-info.get")).default;
const detailedStatsHandler = (await import("#server/api/admin/detailed-stats.get")).default;
const twoFactorDevicesHandler = (await import("#server/api/admin/2fa/devices.get")).default;

// system-info 用 queryRaw + attachments.findMany + count
const _infoRows: Array<Record<string, unknown>> = [];
void _infoRows;
const attachmentRows: Array<Record<string, unknown>> = [];

sharedFake.on("attachments", "findMany", async () => attachmentRows.map(a => ({ ...a })));
sharedFake.on("attachments", "count", async () => attachmentRows.length);

// detailed-stats 用 contents/metas/comments/users count
sharedFake.on("contents", "count", async () => 5);
sharedFake.on("comments", "count", async () => 10);
sharedFake.on("users", "count", async () => 1);
// detailed-stats 还要 prisma.contents.groupBy type/status — 走 contents/categories
sharedFake.on("contents", "groupBy", async () => [
  { type: 0, status: 1, _count: { _all: 3 } },
  { type: 0, status: 0, _count: { _all: 1 } },
  { type: 1, status: 1, _count: { _all: 2 } },
]);
sharedFake.on("contents", "findMany", async ({ where, take, orderBy }: { where?: Record<string, unknown>; take?: number; orderBy?: { create_time?: string } } = {}) => {
  let rows = [
    { cid: 1, title: "文A", slug: "a", status: 1, type: 0, create_time: new Date(), comment_num: 10 },
    { cid: 2, title: "文B", slug: "b", status: 0, type: 0, create_time: new Date(Date.now() - 86400000), comment_num: 0 },
    { cid: 3, title: "文C", slug: "c", status: 1, type: 0, create_time: new Date(Date.now() - 2 * 86400000), comment_num: 5 },
  ];
  if (where) {
    if (where.type !== undefined) rows = rows.filter(r => r.type === where.type);
    if (where.status !== undefined) rows = rows.filter(r => r.status === where.status);
  }
  if (orderBy?.create_time === "desc") rows.sort((a, b) => b.create_time.getTime() - a.create_time.getTime());
  if (take !== undefined) rows = rows.slice(0, take);
  return rows;
});
sharedFake.on("metas", "findMany", async ({ where }: { where?: Record<string, unknown> } = {}) => {
  if (where?.type === "category") return [
    { mid: 1, name: "笔记", _count: { contentrelations: 3 } },
    { mid: 2, name: "生活", _count: { contentrelations: 2 } },
  ];
  return [];
});
sharedFake.on("metas", "count", async () => 2);

// 2fa devices:trusted_devices.findMany 由 helper/auth-fakes 的 registerTrustedDeviceFakes 注册(sharedFake.on)。
// 不在本文件覆盖,避免破坏 two-factor-devices.test.ts 的数据。

beforeEach(() => {
  attachmentRows.length = 0;
  attachmentRows.push({ aid: 1, title: "图", metadata: JSON.stringify({ width: 100, height: 100, size: 1024 }) });
});

describe("admin/system-info.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(systemInfoHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回 node/平台/数据库版本", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(systemInfoHandler, {
      method: "GET",
      cookie,
    }) as { nodeVersion: string, platform: string, database: { version: string }, attachments: { count: number, totalSize: number } };
    expect(typeof r.nodeVersion).toBe("string");
    expect(typeof r.platform).toBe("string");
    expect(typeof r.database.version).toBe("string");
    expect(typeof r.attachments.count).toBe("number");
  });
});

describe("admin/detailed-stats.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(detailedStatsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回详细统计(分类分布/最近文章)", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(detailedStatsHandler, {
      method: "GET",
      cookie,
    });
    expect(r).toBeDefined();
  });
});

// 2fa/devices.get 已在 server/api/admin/two-factor-devices.test.ts 覆盖(含 qqwry mock)
// 这里不再重复(避免 trusted_devices.findMany 数据在两个-factor-devices 测试后被改)
// 仅保留未登录 → 401 简单分支
describe("admin/2fa/devices.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(twoFactorDevicesHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });
});
