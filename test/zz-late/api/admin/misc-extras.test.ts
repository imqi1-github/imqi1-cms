import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie, metas } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== changelogs =====
let changelogRows: Array<Record<string, unknown>> = [];
const changelogCreates: Array<Record<string, unknown>> = [];
sharedFake.on("changelogs", "findMany", async () => changelogRows.map(r => structuredClone(r)));
sharedFake.on("changelogs", "create", async ({ data }: { data: Record<string, unknown> }) => {
  changelogCreates.push({ ...data });
  return { id: 30 + changelogCreates.length, ...data };
});

// ===== comments/batch-delete =====
let batchCommentRows: Array<Record<string, unknown>> = [];
let commentsDeleteFails = false;
const deletedComments: Array<Record<string, unknown>> = [];
const commentCounterUpdates: Array<{ cid: number; count: number }> = [];
sharedFake.on("comments", "findMany", async ({ where }: { where?: { coid?: { in?: number[] }; ip?: string } } = {}) => {
  const ids = where?.coid?.in;
  if (ids) return batchCommentRows.filter(r => ids.includes(r.coid as number)).map(r => structuredClone(r));
  return [];
});
sharedFake.on("comments", "deleteMany", async ({ where }: { where: { coid: { in: number[] } } }) => {
  if (commentsDeleteFails) throw new Error("db down");
  deletedComments.push(where);
  return { count: where.coid.in.length };
});
sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }; data: { comment_num: { decrement: number } } }) => {
  commentCounterUpdates.push({ cid: where.cid, count: data.comment_num.decrement });
  return {};
});

// ===== 统计三件 =====
const countContents = (where: { type?: number; status?: number; create_time?: unknown }) => {
  if (where.create_time) return 1;
  if (where.type === 0) return where.status === 1 ? 4 : where.status === 0 ? 1 : 5;
  if (where.type === 1) return 2;
  return 5;
};
sharedFake.on("contents", "count", async ({ where }: { where: Record<string, unknown> } = { where: {} }) => countContents(where as { type?: number; status?: number }));
sharedFake.on("comments", "count", async ({ where }: { where?: { status?: number; create_time?: unknown } } = {}) => {
  if (where?.create_time) return 3;
  if (where?.status === 0) return 2;
  return 10;
});
sharedFake.on("metas", "count", async ({ where }: { where: { type: string } }) => (where.type === "category" ? 3 : 7));

// ===== pages / recent-contents / admin travels =====
let pageRows: Array<Record<string, unknown>> = [];
const seenPageArgs: Array<Record<string, unknown>> = [];
sharedFake.on("contents", "findMany", async (args: { where?: Record<string, unknown>; take?: number; skip?: number }) => {
  seenPageArgs.push(args);
  return pageRows.map(r => structuredClone(r));
});
let pageRelations: Array<Record<string, unknown>> = [];
sharedFake.on("contentrelations", "findMany", async () => pageRelations.map(r => structuredClone(r)));
let adminTravelRows: Array<Record<string, unknown>> = [];
sharedFake.on("travels", "findMany", async () => adminTravelRows.map(r => structuredClone(r)));

// ===== links 修改审批 =====
let modRow: Record<string, unknown> | null = null;
const linkUpdates: Array<Record<string, unknown>> = [];
const linkDeletes: number[] = [];
sharedFake.on("links", "findUnique", async ({ where }: { where: { id: number } }) =>
  modRow && modRow.id === where.id ? structuredClone(modRow) : null);
sharedFake.on("links", "update", async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
  linkUpdates.push({ id: where.id, ...data });
  return { id: where.id, ...data };
});
sharedFake.on("links", "delete", async ({ where }: { where: { id: number } }) => {
  linkDeletes.push(where.id);
  return {};
});

const adminChangelogsHandler = (await import("#server/api/admin/changelogs.get")).default;
const tagsHandler = (await import("#server/api/admin/tags.get")).default;
const contentsListHandler = (await import("#server/api/admin/contents.get")).default;
const changelogImportHandler = (await import("#server/api/admin/changelogs/import.post")).default;
const commentBatchDeleteHandler = (await import("#server/api/admin/comments/batch-delete.post")).default;
const statsHandler = (await import("#server/api/admin/stats.get")).default;
const detailedStatsHandler = (await import("#server/api/admin/detailed-stats.get")).default;
const pagesHandler = (await import("#server/api/admin/pages.get")).default;
const recentContentsHandler = (await import("#server/api/admin/recent-contents.get")).default;
const adminTravelsHandler = (await import("#server/api/admin/travels.get")).default;
const approveModHandler = (await import("#server/api/admin/links/[id]/approve-modification.patch")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  changelogRows = [
    { id: 2, content: JSON.stringify([{ type: "修复", value: "**修复甲**" }]), create_time: new Date(Date.UTC(2026, 2, 1)) },
  ];
  changelogCreates.length = 0;
  batchCommentRows = [
    { coid: 1, cid: 5, status: 1 },
    { coid: 2, cid: 5, status: 1 },
    { coid: 3, cid: 6, status: 0 },
  ];
  commentsDeleteFails = false;
  deletedComments.length = 0;
  commentCounterUpdates.length = 0;
  pageRows = [
    { cid: 50, title: "关于", slug: "about", desc: null, status: 1, create_time: new Date(), update_time: new Date(), user: { uid: 1, name: "admin", nickname: "阿棋" } },
  ];
  pageRelations = [{ cid: 50, mid: 2, metas: { mid: 2, name: "笔记", slug: "note" } }];
  adminTravelRows = [
    {
      id: 1, name: "西湖", desc: null, cover: null, longitude: 120, latitude: 30, sort: 1, enabled: true, create_time: new Date(),
      contenttravels: [{ content: { cid: 1, title: "甲" } }, { content: { cid: 2, title: "乙" } }],
    },
  ];
  modRow = { id: 9, name: "新名", link: "https://new.com", desc: null, avatar: null, originalLinkId: 5, isModification: true };
  linkUpdates.length = 0;
  linkDeletes.length = 0;
  seenPageArgs.length = 0;
});

describe("admin/changelogs.get", () => {
  test("未登录 401;列表渲染 markdown", async () => {
    await expect(callAdmin(adminChangelogsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
    const r = (await callAdmin(adminChangelogsHandler, { method: "GET", cookie: await cookie() })) as unknown as Array<{ id: number; content: Array<{ html: string }>; createTime: Date }>;
    expect(r[0]!.content[0]!.html).toContain("<strong>修复甲</strong>");
    expect(r[0]!.createTime).toBeTruthy();
  });
});

describe("admin/changelogs/import.post", () => {
  const run = async (source: unknown, opts: { cookie?: string; csrf?: string } = {}) => {
    const body = { source, csrfToken: opts.csrf ?? CSRF_TOKEN };
    return callAdmin(changelogImportHandler, { method: "POST", cookie: opts.cookie, body });
  };

  test("未登录 401(getUser 先于 CSRF);CSRF 403", async () => {
    await expect(run("[]", { cookie: undefined })).rejects.toMatchObject({ statusCode: 401 });
    await expect(run("[]", { cookie: await cookie(), csrf: "bad" })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("空内容/坏 JSON/结构不对 → 400", async () => {
    const c = await cookie();
    await expect(run("  ", { cookie: c })).rejects.toMatchObject({ statusCode: 400 });
    await expect(run("{bad", { cookie: c })).rejects.toMatchObject({ statusCode: 400 });
    await expect(run(JSON.stringify({ foo: 1 }), { cookie: c })).rejects.toMatchObject({ statusCode: 400 });
    await expect(run("[]", { cookie: c })).rejects.toMatchObject({ statusCode: 400, message: "内容不能为空" });
  });

  test("单条记录导入;多条记录带 createTime 逐条入库", async () => {
    const c = await cookie();
    const r1 = (await run(JSON.stringify([{ type: "功能", value: "新功能" }]), { cookie: c })) as unknown as { success: boolean; imported: number };
    expect(r1.imported).toBe(1);
    expect(changelogCreates[0]!.content).toContain("新功能");

    changelogCreates.length = 0;
    const multi = [
      { entries: [{ type: "功能", value: "A" }], createTime: "2026-06-22" },
      { entries: [{ type: "修复", value: "B" }] },
    ];
    const r2 = (await run(JSON.stringify(multi), { cookie: c })) as unknown as { imported: number };
    expect(r2.imported).toBe(2);
    expect(changelogCreates[0]!.create_time).toBeInstanceOf(Date);
    expect((changelogCreates[0]!.create_time as Date).toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(changelogCreates[1]!.create_time).toBeUndefined();
  });
});

describe("admin/comments/batch-delete.post", () => {
  const call = (body: Record<string, unknown>, c?: string) =>
    callAdmin(commentBatchDeleteHandler, { method: "POST", cookie: c ?? (undefined as unknown as string), body: { csrfToken: CSRF_TOKEN, ...body } });

  test("未登录 401;CSRF 403;ids 缺失/非数组/空/非法元素 → 400", async () => {
    await expect(callAdmin(commentBatchDeleteHandler, { method: "POST", body: { csrfToken: CSRF_TOKEN, ids: [1] } })).rejects.toMatchObject({ statusCode: 401 });
    const c = await cookie();
    await expect(call({}, c)).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ ids: "x" }, c)).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ ids: [] }, c)).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ ids: [1, "a"] }, c)).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ ids: [1.5] }, c)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("批量删除:仅已发布评论回减计数、按文章聚合", async () => {
    const r = (await call({ ids: [1, 2, 3] }, await cookie())) as unknown as { success: boolean; count: number };
    expect(r.count).toBe(3);
    expect(deletedComments[0]).toEqual({ coid: { in: [1, 2, 3] } });
    // coid 1/2 已发布同属 cid 5 → 一次 decrement 2;coid 3 待审核不回减
    expect(commentCounterUpdates).toEqual([{ cid: 5, count: 2 }]);
  });

  test("事务失败 → 500", async () => {
    commentsDeleteFails = true;
    await expect(call({ ids: [1] }, await cookie())).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("admin/stats.get 与 detailed-stats.get", () => {
  test("未登录 401;基础统计五项", async () => {
    await expect(callAdmin(statsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
    const r = (await callAdmin(statsHandler, { method: "GET", cookie: await cookie() })) as unknown as Record<string, number>;
    expect(r).toEqual({ contents: 5, pages: 2, comments: 10, categories: 3, users: 1 });
  });

  test("详细统计:发布/草稿/本月/待审口径", async () => {
    const r = (await callAdmin(detailedStatsHandler, { method: "GET", cookie: await cookie() })) as unknown as {
      contents: { total: number; published: number; draft: number; thisMonth: number };
      comments: { total: number; pending: number; thisMonth: number };
      tags: { total: number };
      users: { total: number; online: number };
    };
    expect(r.contents).toEqual({ total: 5, published: 4, draft: 1, thisMonth: 1 });
    expect(r.comments).toEqual({ total: 10, pending: 2, thisMonth: 3 });
    expect(r.tags.total).toBe(7);
    expect(r.users.online).toBe(0);
  });
});

describe("admin/pages.get", () => {
  test("未登录 401;列表带关系与分页;status 筛选进 where", async () => {
    await expect(callAdmin(pagesHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
    const r = (await callAdmin(pagesHandler, { method: "GET", cookie: await cookie(), url: "/api/admin/pages?status=1" })) as unknown as {
      data: Array<{ cid: number; relations: Array<{ mid: number }> }>;
      pagination: { page: number; pageSize: number; total: number };
    };
    expect(r.data[0]!.relations[0]!.mid).toBe(2);
    expect(r.data[0]).not.toHaveProperty("content");
    expect(r.pagination.total).toBe(2);
    const lastArgs = seenPageArgs.at(-1) as unknown as { where: Record<string, unknown> };
    expect(lastArgs.where).toMatchObject({ type: 1, status: 1 });
  });

  test("分页钳制:负页码回 1;pageSize 下限 1", async () => {
    await callAdmin(pagesHandler, { method: "GET", cookie: await cookie(), url: "/api/admin/pages?page=-3&pageSize=0" });
    const args = seenPageArgs.at(-1) as unknown as { skip: number; take: number };
    expect(args).toMatchObject({ skip: 0, take: 1 });
  });
});

describe("admin/recent-contents.get 与 admin/travels.get", () => {
  test("最新文章:take 上限 + 白名单字段", async () => {
    await expect(callAdmin(recentContentsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
    const r = (await callAdmin(recentContentsHandler, { method: "GET", cookie: await cookie() })) as unknown as Array<Record<string, unknown>>;
    const args = seenPageArgs.at(-1) as unknown as { take: number };
    expect(args.take).toBe(5);
    expect(Array.isArray(r)).toBe(true);
  });

  test("地点:cids 展平;未登录 401", async () => {
    await expect(callAdmin(adminTravelsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
    const r = (await callAdmin(adminTravelsHandler, { method: "GET", cookie: await cookie() })) as unknown as Array<{ id: number; cids: number[]; contents: Array<{ title: string }> }>;
    expect(r[0]!.cids).toEqual([1, 2]);
    expect(r[0]!.contents.map(c => c.title)).toEqual(["甲", "乙"]);
    expect(r[0]).toHaveProperty("enabled", true);
  });
});

describe("admin/links/[id]/approve-modification.patch", () => {
  const call = (id: string, body: Record<string, unknown>, c?: string) =>
    callAdmin(approveModHandler, { method: "PATCH", params: { id }, cookie: c ?? (undefined as unknown as string), body: { csrfToken: CSRF_TOKEN, ...body } });

  test("未登录 401;缺 id/非法 id 400;CSRF 403;非法 action 400", async () => {
    await expect(callAdmin(approveModHandler, { method: "PATCH", params: { id: "9" }, body: { csrfToken: CSRF_TOKEN, action: "approve" } })).rejects.toMatchObject({ statusCode: 401 });
    const c = await cookie();
    await expect(call("", { action: "approve" }, c)).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("abc", { action: "approve" }, c)).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(approveModHandler, { method: "PATCH", params: { id: "9" }, cookie: c, body: { action: "approve" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call("9", { action: "hmm" }, c)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("404 不存在;非修改请求 400", async () => {
    const c = await cookie();
    modRow = null;
    await expect(call("9", { action: "approve" }, c)).rejects.toMatchObject({ statusCode: 404 });
    modRow = { id: 9, name: "普通友链", isModification: false };
    await expect(call("9", { action: "approve" }, c)).rejects.toMatchObject({ statusCode: 400, message: "这不是一个修改请求" });
  });

  test("approve:更新原友链 + 删除修改行;reject:仅删除修改行", async () => {
    const c = await cookie();
    const r1 = (await call("9", { action: "approve" }, c)) as unknown as { success: boolean; message: string };
    expect(r1.message).toContain("已批准修改");
    expect(linkUpdates).toEqual([{ id: 5, name: "新名", link: "https://new.com", desc: null, avatar: null }]);
    expect(linkDeletes).toEqual([9]);

    linkUpdates.length = 0;
    linkDeletes.length = 0;
    await call("9", { action: "reject" }, c);
    expect(linkUpdates).toHaveLength(0);
    expect(linkDeletes).toEqual([9]);
  });
});

describe("admin 收尾域 分支补测", () => {
  test("changelogs.get / recent-contents / stats:401 与 500", async () => {
    await expect(callAdmin(adminChangelogsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(recentContentsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(statsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });

    const ck = await cookie();
    sharedFake.on("changelogs", "findMany", async () => { throw new Error("db down"); });
    await expect(callAdmin(adminChangelogsHandler, { method: "GET", cookie: ck })).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("changelogs", "findMany", async () => changelogRows.map(r => structuredClone(r)));

    sharedFake.on("contents", "findMany", async () => { throw new Error("db down"); });
    await expect(callAdmin(recentContentsHandler, { method: "GET", cookie: ck })).rejects.toMatchObject({ statusCode: 500 });

    sharedFake.on("users", "count", async () => { throw new Error("db down"); });
    await expect(callAdmin(statsHandler, { method: "GET", cookie: ck })).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("admin 只读端点 500 / 列表筛选", () => {
  test("tags.get / travels.get:DB 异常 → 500", async () => {
    const ck = await cookie();
    sharedFake.on("metas", "findMany", async () => { throw new Error("db down"); });
    await expect(callAdmin(tagsHandler, { method: "GET", cookie: ck })).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("metas", "findMany", async () => metas.map(m => ({ ...m, _count: { contentrelations: 3 } })));

    sharedFake.on("travels", "findMany", async () => { throw new Error("db down"); });
    await expect(callAdmin(adminTravelsHandler, { method: "GET", cookie: ck })).rejects.toMatchObject({ statusCode: 500 });
  });

  test("contents.get:分类/标签/status 筛选进 where", async () => {
    const ck = await cookie();
    const seen: Array<Record<string, unknown>> = [];
    sharedFake.on("contents", "findMany", async (args: { where: Record<string, unknown> }) => {
      seen.push(args.where);
      return [];
    });
    sharedFake.on("contentrelations", "findMany", async () => []);
    sharedFake.on("contents", "count", async () => 0);

    await callAdmin(contentsListHandler, { method: "GET", cookie: ck, url: "/api/admin/contents?status=1&category=2&tag=3" });
    expect(JSON.stringify(seen[0])).toContain("contentrelations");
    expect(seen[0]!.status).toBe(1);
  });
});
