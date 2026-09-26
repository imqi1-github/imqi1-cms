import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const archiveHandler = (await import("#server/api/mini/archive.get")).default;
const categoriesHandler = (await import("#server/api/mini/categories.get")).default;
const changelogsHandler = (await import("#server/api/mini/changelogs.get")).default;
const latestContentsHandler = (await import("#server/api/mini/latest-contents.get")).default;
const linksHandler = (await import("#server/api/mini/links.get")).default;
const messagesConfigHandler = (await import("#server/api/mini/messages-config.get")).default;
const repoHandler = (await import("#server/api/mini/repo.get")).default;
const travelsHandler = (await import("#server/api/mini/travels.get")).default;

const contentRows: Array<Record<string, unknown>> = [];
contentRows.push({ cid: 1, title: "文A", slug: "a", type: 0, status: 1, create_time: new Date(Date.UTC(2026, 2, 10)), covers: "[]" });
contentRows.push({ cid: 2, title: "文B", slug: "b", type: 0, status: 1, create_time: new Date(Date.UTC(2026, 1, 5)), covers: "[]" });

const changelogRows: Array<Record<string, unknown>> = [];
changelogRows.push({ id: 1, content: JSON.stringify([{ type: "修复", value: "**bug**" }]), create_time: new Date() });

const metaRows: Array<Record<string, unknown>> = [];
metaRows.push({ mid: 1, name: "笔记", slug: "note", type: "category" });
metaRows.push({ mid: 2, name: "生活", slug: "life", type: "category" });

const linkRows: Array<Record<string, unknown>> = [];
linkRows.push({ id: 1, name: "甲", link: "https://a.com", enabled: true, desc: null });
linkRows.push({ id: 2, name: "乙", link: "https://b.com", enabled: true, desc: "d" });

const travelRows: Array<Record<string, unknown>> = [];
travelRows.push({ id: 1, name: "故宫", longitude: 116.397, latitude: 39.918, enabled: true });

sharedFake.on("contents", "findMany", async ({ where, orderBy, select }: { where?: Record<string, unknown>; orderBy?: Record<string, string>; select?: Record<string, boolean>; take?: number; skip?: number } = {}) => {
  let rows = contentRows.slice();
  if (where) {
    if (where.type !== undefined) rows = rows.filter(c => c.type === where.type);
    if (where.status !== undefined) rows = rows.filter(c => c.status === where.status);
  }
  if (orderBy?.create_time === "desc") rows.sort((a, b) => new Date(b.create_time as Date).getTime() - new Date(a.create_time as Date).getTime());
  if (select) {
    rows = rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(select)) if (select[k]) out[k] = (r as Record<string, unknown>)[k];
      return out;
    });
  }
  return rows.map(r => ({ ...r }));
});
sharedFake.on("contents", "findFirst", async ({ where }: { where?: Record<string, unknown> } = {}) => {
  return contentRows.find(c => {
    if (where?.slug !== undefined && c.slug !== where.slug) return false;
    return true;
  }) ?? null;
});
sharedFake.on("contents", "count", async () => contentRows.length);
sharedFake.on("changelogs", "findMany", async ({ take }: { take?: number } = {}) => {
  const rows = changelogRows.slice();
  return (take !== undefined ? rows.slice(0, take) : rows).map(r => ({ ...r }));
});
sharedFake.on("metas", "findMany", async ({ where }: { where?: { type?: string } } = {}) => {
  return metaRows.filter(m => where?.type === undefined || m.type === where.type).map(m => ({
    ...m,
    contentrelations: [], // mini 端点读 cover/latestTitle 走 contentrelations
  }));
});
sharedFake.on("contentrelations", "groupBy", async () => [
  { mid: 1, _count: { _all: 3 } },
  { mid: 2, _count: { _all: 2 } },
]);
sharedFake.on("metas", "findFirst", async ({ where }: { where: { slug?: string; type?: string; mid?: number } }) => {
  return metaRows.find(m => {
    if (where.slug !== undefined && m.slug !== where.slug) return false;
    if (where.type !== undefined && m.type !== where.type) return false;
    if (where.mid !== undefined && m.mid !== where.mid) return false;
    return true;
  }) ?? null;
});
sharedFake.on("links", "findMany", async () => linkRows.filter(l => l.enabled).map(l => ({ ...l })));
sharedFake.on("subscribes", "findMany", async () => [
  { id: 1, name: "源甲", url: "https://a.com", avatar: null },
]);
sharedFake.on("travels", "findMany", async () => travelRows.filter(t => t.enabled).map(t => ({ ...t, contenttravels: [] })));
sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) => {
  if (where.key === "messageContentId") return { key: "messageContentId", value: "88" };
  return null;
});

beforeEach(() => {
  contentRows.length = 0;
  contentRows.push({ cid: 1, title: "文A", slug: "a", type: 0, status: 1, create_time: new Date(Date.UTC(2026, 2, 10)), covers: "[]" });
  contentRows.push({ cid: 2, title: "文B", slug: "b", type: 0, status: 1, create_time: new Date(Date.UTC(2026, 1, 5)), covers: "[]" });
});

describe("mini/archive.get(小程序归档列表)", () => {
  test("返回 success + data 按年月分组", async () => {
    const r = await callAdmin(archiveHandler, { method: "GET" }) as { success: boolean, data: Array<{ title: string, items: unknown[] }> };
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data[0]!.items.length).toBeGreaterThan(0);
  });

  test("limit 钳制", async () => {
    const r = await callAdmin(archiveHandler, { method: "GET", url: "/api/mini/archive?limit=500" }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});

describe("mini/categories.get(小程序分类列表)", () => {
  test("返回分类列表", async () => {
    const r = await callAdmin(categoriesHandler, { method: "GET" }) as { success: boolean, data: unknown[] };
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
  });
});

describe("mini/changelogs.get(小程序更新日志)", () => {
  test("返回 success + data 数组", async () => {
    const r = await callAdmin(changelogsHandler, { method: "GET" }) as { success: boolean, data: unknown[] };
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
  });

  test("limit 钳制", async () => {
    const r = await callAdmin(changelogsHandler, { method: "GET", url: "/api/mini/changelogs?limit=999" }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});

describe("mini/latest-contents.get(最新文章)", () => {
  test("返回最新文章列表", async () => {
    const r = await callAdmin(latestContentsHandler, { method: "GET" }) as { success: boolean, data: unknown[] };
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
  });

  test("limit 钳制", async () => {
    const r = await callAdmin(latestContentsHandler, { method: "GET", url: "/api/mini/latest-contents?limit=999" }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});

describe("mini/links.get(小程序友链)", () => {
  test("返回 success + 友链数组", async () => {
    const r = await callAdmin(linksHandler, { method: "GET" }) as { success: boolean, data: unknown[] };
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
  });
});

describe("mini/messages-config.get(留言板配置)", () => {
  test("返回 success + contentId", async () => {
    const r = await callAdmin(messagesConfigHandler, { method: "GET" }) as { success: boolean, data: { contentId: number } };
    expect(r.success).toBe(true);
    expect(typeof r.data.contentId).toBe("number");
  });
});

describe("mini/repo.get(仓库信息)", () => {
  test("缺少参数 → 400", async () => {
    await expect(callAdmin(repoHandler, {
      method: "GET",
      url: "/api/mini/repo",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("非法 platform → 400", async () => {
    await expect(callAdmin(repoHandler, {
      method: "GET",
      url: "/api/mini/repo?platform=other&owner=foo&repo=bar",
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("mini/travels.get(小程序足迹)", () => {
  test("返回 success + data 数组", async () => {
    const r = await callAdmin(travelsHandler, { method: "GET" }) as { success: boolean, data: unknown[] };
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
  });
});
