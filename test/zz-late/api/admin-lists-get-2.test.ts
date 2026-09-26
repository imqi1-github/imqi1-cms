import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

const adminLinksHandler = (await import("#server/api/admin/links.get")).default;
const adminTravelsHandler = (await import("#server/api/admin/travels.get")).default;
const adminContentsHandler = (await import("#server/api/admin/contents.get")).default;

// links 假件
const linkRows: Array<Record<string, unknown>> = [];
linkRows.push({ id: 1, name: "甲", link: "https://a.com", enabled: true });
linkRows.push({ id: 2, name: "乙", link: "https://b.com", enabled: false });

sharedFake.on("links", "findMany", async () => linkRows.map(l => ({ ...l })));
sharedFake.on("links", "count", async () => linkRows.length);

// travels 假件
const travelRows: Array<Record<string, unknown>> = [];
travelRows.push({ id: 1, name: "故宫", longitude: 116.397, latitude: 39.918, enabled: true });
travelRows.push({ id: 2, name: "外滩", longitude: 121.490, latitude: 31.236, enabled: true });

sharedFake.on("travels", "findMany", async () => travelRows.map(t => ({
  ...t,
  contenttravels: [], // travels.get 用 include contenttravels → content
})));
sharedFake.on("travels", "count", async () => travelRows.length);

// contents 假件(管理员后台列表)
const contentRows: Array<Record<string, unknown>> = [];
contentRows.push({ cid: 1, title: "文A", slug: "a", type: 0, status: 1, comment_num: 0 });
contentRows.push({ cid: 2, title: "文B", slug: "b", type: 0, status: 0, comment_num: 0 });
contentRows.push({ cid: 100, title: "关于", slug: "about", type: 1, status: 1, comment_num: 0 });

sharedFake.on("contents", "findMany", async ({ where, take, skip, _orderBy }: { where?: Record<string, unknown>; take?: number; skip?: number; _orderBy?: Record<string, string> } = {}) => {
  let rows = contentRows.slice();
  if (where) {
    if (where.type !== undefined) rows = rows.filter(c => c.type === where.type);
    if (where.status !== undefined) rows = rows.filter(c => c.status === where.status);
    if (where.OR !== undefined) {
      rows = rows.filter(c => (where.OR as Array<Record<string, unknown>>).some(cond => {
        return Object.entries(cond).every(([k, v]) => c[k] === v);
      }));
    }
  }
  if (skip !== undefined) rows = rows.slice(skip);
  if (take !== undefined) rows = rows.slice(0, take);
  return rows;
});
sharedFake.on("contents", "count", async ({ where }: { where?: Record<string, unknown> } = {}) => {
  let rows = contentRows.slice();
  if (where) {
    if (where.type !== undefined) rows = rows.filter(c => c.type === where.type);
    if (where.status !== undefined) rows = rows.filter(c => c.status === where.status);
  }
  return rows.length;
});

beforeEach(() => {
  linkRows.length = 0;
  linkRows.push({ id: 1, name: "甲", link: "https://a.com", enabled: true });
  linkRows.push({ id: 2, name: "乙", link: "https://b.com", enabled: false });
  travelRows.length = 0;
  travelRows.push({ id: 1, name: "故宫", longitude: 116.397, latitude: 39.918, enabled: true });
  travelRows.push({ id: 2, name: "外滩", longitude: 121.490, latitude: 31.236, enabled: true });
  contentRows.length = 0;
  contentRows.push({ cid: 1, title: "文A", slug: "a", type: 0, status: 1, comment_num: 0 });
  contentRows.push({ cid: 2, title: "文B", slug: "b", type: 0, status: 0, comment_num: 0 });
  contentRows.push({ cid: 100, title: "关于", slug: "about", type: 1, status: 1, comment_num: 0 });
});

describe("admin/links.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminLinksHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回友链列表", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminLinksHandler, {
      method: "GET",
      cookie,
    }) as Array<{ id: number, name: string }>;
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(2);
    expect(r[0]!.id).toBe(1);
  });
});

describe("admin/travels.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminTravelsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回足迹列表", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminTravelsHandler, {
      method: "GET",
      cookie,
    }) as Array<{ id: number, name: string, longitude: number, latitude: number }>;
    expect(r.length).toBe(2);
    expect(r[0]!.longitude).toBe(116.397);
  });
});

describe("admin/contents.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminContentsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 默认返回全部内容", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminContentsHandler, {
      method: "GET",
      cookie,
    }) as { data: Array<{ cid: number }>, pagination: { total: number } };
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.pagination.total).toBeGreaterThan(0);
  });

  test("type=0 文章筛选", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminContentsHandler, {
      method: "GET",
      cookie,
      url: "/api/admin/contents?type=0",
    }) as { data: Array<{ type: number }> };
    expect(r.data.every(c => c.type === 0)).toBe(true);
  });
});
