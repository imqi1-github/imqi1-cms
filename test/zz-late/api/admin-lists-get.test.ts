import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

// ===== admin GET 简单资源(依赖真实 session,registerAuthFakes 提供 users handler) =====

const adminCategoriesHandler = (await import("#server/api/admin/categories.get")).default;
const adminTagsHandler = (await import("#server/api/admin/tags.get")).default;
const adminSubscribesHandler = (await import("#server/api/admin/subscribes.get")).default;
const adminSettingsHandler = (await import("#server/api/admin/settings.get")).default;
const statsHandler = (await import("#server/api/admin/stats.get")).default;
const popularContentsHandler = (await import("#server/api/admin/popular-contents.get")).default;

// metas 假件(覆盖 registerAuthFakes 不存在的 metas handler)
const metaRows: Array<Record<string, unknown>> = [];
const subRows: Array<Record<string, unknown>> = [];
const infoRows: Array<{ key: string, value: string }> = [];

metaRows.push({ mid: 1, name: "分类甲", slug: "cat-a", type: "category", desc: null });
metaRows.push({ mid: 2, name: "分类乙", slug: "cat-b", type: "category", desc: "d" });
metaRows.push({ mid: 100, name: "标签甲", slug: "tag-a", type: "tag", desc: null });
metaRows.push({ mid: 101, name: "标签乙", slug: "tag-b", type: "tag", desc: null });

subRows.push({ id: 1, name: "源甲", url: "https://a.com" });
subRows.push({ id: 2, name: "源乙", url: "https://b.com" });

infoRows.push({ key: "siteName", value: "测试站" });
infoRows.push({ key: "commentEnabled", value: "true" });

sharedFake.on("metas", "findMany", async ({ where, take }: { where?: { type?: string; [k: string]: unknown }; take?: number } = {}) => {
  let rows = metaRows.filter(m => {
    if (where?.type !== undefined && m.type !== where.type) return false;
    return true;
  });
  if (take !== undefined) rows = rows.slice(0, take);
  return rows.map(m => ({ ...m, _count: { contentrelations: 3 } }));
});
sharedFake.on("metas", "count", async ({ where }: { where: { type?: string } } = { where: {} }) =>
  metaRows.filter(m => where.type === undefined || m.type === where.type).length);
sharedFake.on("subscribes", "findMany", async () => subRows.map(r => ({ ...r })));
sharedFake.on("subscribes", "count", async () => subRows.length);
sharedFake.on("informations", "findMany", async ({ select }: { select?: { key?: boolean; value?: boolean } } = {}) => {
  if (select?.key === true) return infoRows.map(r => ({ key: r.key }));
  return infoRows.map(r => ({ ...r }));
});
sharedFake.on("informations", "findFirst", async ({ where }: { where?: { key?: string } } = {}) =>
  (where?.key !== undefined ? infoRows.find(r => r.key === where.key) ?? null : null));
sharedFake.on("informations", "count", async () => infoRows.length);
// stats.get 用:contents/comments/users count
sharedFake.on("contents", "count", async ({ where }: { where: { type?: number } } = { where: {} }) => {
  if (where.type === 0) return 10;
  if (where.type === 1) return 3;
  return 13;
});
sharedFake.on("comments", "count", async () => 5);
sharedFake.on("users", "count", async () => 1);
// popular-contents.get:findMany contents
sharedFake.on("contents", "findMany", async ({ where, take }: { where?: { comment_num?: { gt?: number }; [k: string]: unknown }; take?: number } = {}) => {
  if (where?.comment_num?.gt !== undefined) {
    return [
      { cid: 1, title: "热门文", slug: "hot", type: 0, status: 1, comment_num: 10, create_time: new Date() },
      { cid: 2, title: "次热文", slug: "next", type: 0, status: 1, comment_num: 5, create_time: new Date() },
    ].slice(0, take ?? 10).map(r => ({ ...r, _count: { comments: 1 } }));
  }
  return [];
});

beforeEach(() => {
  metaRows.length = 0;
  metaRows.push({ mid: 1, name: "分类甲", slug: "cat-a", type: "category", desc: null });
  metaRows.push({ mid: 2, name: "分类乙", slug: "cat-b", type: "category", desc: "d" });
  metaRows.push({ mid: 100, name: "标签甲", slug: "tag-a", type: "tag", desc: null });
  metaRows.push({ mid: 101, name: "标签乙", slug: "tag-b", type: "tag", desc: null });
  subRows.length = 0;
  subRows.push({ id: 1, name: "源甲", url: "https://a.com" });
  subRows.push({ id: 2, name: "源乙", url: "https://b.com" });
  infoRows.length = 0;
  infoRows.push({ key: "siteName", value: "测试站" });
  infoRows.push({ key: "commentEnabled", value: "true" });
});

describe("admin/categories.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminCategoriesHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回分类列表(含 contentCount)", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminCategoriesHandler, {
      method: "GET",
      cookie,
    }) as Array<{ mid: number, slug: string, contentCount: number }>;
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(2);
    expect(r[0]!.slug).toBe("cat-a");
    expect(r[0]!.contentCount).toBe(3);
  });
});

describe("admin/tags.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminTagsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回标签列表", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminTagsHandler, {
      method: "GET",
      cookie,
    }) as Array<{ mid: number, slug: string, type: string }>;
    expect(r.length).toBe(2);
    expect(r[0]!.type).toBe("tag");
  });
});

describe("admin/subscribes.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminSubscribesHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回订阅源列表", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminSubscribesHandler, {
      method: "GET",
      cookie,
    }) as Array<{ id: number, name: string }>;
    expect(r.length).toBe(2);
    expect(r[0]!.name).toBe("源甲");
  });
});

describe("admin/settings.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminSettingsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回 settings 对象(含默认值与 db 覆盖)", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminSettingsHandler, {
      method: "GET",
      cookie,
    }) as { siteName?: string, commentEnabled?: boolean, commentAvatarService?: string };
    expect(typeof r).toBe("object");
    // infoRows 提供 siteName → 应覆盖默认
    expect(r.siteName).toBe("测试站");
    // infoRows 提供 commentEnabled="true" → 转布尔 true
    expect(r.commentEnabled).toBe(true);
  });
});

describe("admin/stats.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(statsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回五项计数", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(statsHandler, {
      method: "GET",
      cookie,
    }) as { contents: number, pages: number, comments: number, categories: number, users: number };
    expect(r.contents).toBe(10);
    expect(r.pages).toBe(3);
    expect(r.comments).toBe(5);
    expect(r.categories).toBe(2);
    expect(r.users).toBe(1);
  });
});

describe("admin/popular-contents.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(popularContentsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回热门文章列表", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(popularContentsHandler, {
      method: "GET",
      cookie,
    }) as Array<{ cid: number, title: string }>;
    expect(Array.isArray(r)).toBe(true);
    expect(r[0]!.cid).toBe(1);
  });
});
