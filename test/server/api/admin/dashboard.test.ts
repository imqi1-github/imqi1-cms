import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { loginSessionCookie } from "#test/helpers/admin";
import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
// runtime-info 桩已在 nitro-globals(useRuntimeConfig 返回 {redis:null,buildHash:""})

let attachmentRows: Array<{ metadata: unknown }> = [];
sharedFake.on("attachments", "count", () => attachmentRows.length);
sharedFake.on("attachments", "findMany", async () => attachmentRows.map(r => ({ ...r })));

let contentRows: Array<{ cid: number; title: string; comment_num: number; type: number; status: number }> = [];
sharedFake.on("contents", "findMany", async ({ where }: { where?: { type?: number; status?: number; comment_num?: { gt: number } } }) =>
  contentRows
    .filter(c =>
      (where?.type === undefined || c.type === where.type) &&
      (where?.status === undefined || c.status === where.status) &&
      (where?.comment_num?.gt === undefined || c.comment_num > where.comment_num.gt))
    .map(c => ({ ...c })));

let commentRows: Array<{ coid: number; cid: number; name: string; content: string; create_time: Date; status: number; parent_id: null }> = [];
sharedFake.on("comments", "findMany", async () => commentRows.map(c => ({ ...c, content_ref: null })));

const detailedStatsHandler = (await import("#server/api/admin/detailed-stats.get")).default;
const systemInfoHandler = (await import("#server/api/admin/system-info.get")).default;
const popularHandler = (await import("#server/api/admin/popular-contents.get")).default;
const recentCommentsHandler = (await import("#server/api/admin/recent-comments.get")).default;

beforeEach(() => {
  attachmentRows = [{ metadata: { size: 100 } }, { metadata: { size: 50 } }, { metadata: null }];
  contentRows = [
    { cid: 1, title: "热门A", comment_num: 5, type: 0, status: 1 },
    { cid: 2, title: "零评论", comment_num: 0, type: 0, status: 1 },
    { cid: 3, title: "草稿有评论", comment_num: 9, type: 0, status: 0 },
  ];
  commentRows = [
    { coid: 1, cid: 10, name: "甲", content: "评论一", create_time: new Date(), status: 1, parent_id: null },
    { coid: 2, cid: 10, name: "乙", content: "评论二", create_time: new Date(), status: 0, parent_id: null },
  ];
});

describe("admin/dashboard 只读端点", () => {
  test("popular-contents:只含已发布且有评论的文章", async () => {
    const session = await loginSessionCookie();
    const r = (await popularHandler(makeAuthEvent({ method: "GET", cookie: session, peer: "10.9.4.1" }).event)) as Array<{ cid: number }>;
    expect(r.map(x => x.cid)).toEqual([1]);
  });

  test("popular-contents 未登录 → 401", async () => {
    await expect(popularHandler(makeAuthEvent({ peer: "10.9.4.2" }).event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("recent-comments:白名单不含 ip/agent/mail", async () => {
    const session = await loginSessionCookie();
    const r = (await recentCommentsHandler(makeAuthEvent({ method: "GET", cookie: session, peer: "10.9.4.3" }).event)) as Array<Record<string, unknown>>;
    expect(r).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain('"ip"');
    expect(JSON.stringify(r)).not.toContain('"agent"');
    expect(JSON.stringify(r)).not.toContain('"mail"');
  });

  test("system-info:聚合 DB 版本/附件统计/运行时", async () => {
    const session = await loginSessionCookie();
    const r = (await systemInfoHandler(makeAuthEvent({ method: "GET", cookie: session, peer: "10.9.4.4" }).event)) as unknown as {
      nodeVersion: string; attachments: { count: number; totalSize: number };
    };
    expect(r.attachments.count).toBe(3);
    expect(r.attachments.totalSize).toBe(150); // null metadata 归一为 size 0
    expect(typeof r.nodeVersion).toBe("string");
  });
});

describe("admin/detailed-stats 分支补测", () => {
  test("未登录 → 401;DB 异常 → 500", async () => {
    await expect(detailedStatsHandler(makeAuthEvent({ peer: "10.9.5.1" }).event)).rejects.toMatchObject({ statusCode: 401 });
    sharedFake.on("metas", "count", async () => { throw new Error("db down"); });
    const session = await loginSessionCookie();
    await expect(detailedStatsHandler(makeAuthEvent({ method: "GET", cookie: session, peer: "10.9.5.2" }).event)).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("admin 只读端点 分支补测", () => {
  test("popular-contents / recent-comments / system-info:未登录 → 401", async () => {
    await expect(popularHandler(makeAuthEvent({ peer: "10.9.6.1" }).event)).rejects.toMatchObject({ statusCode: 401 });
    await expect(recentCommentsHandler(makeAuthEvent({ peer: "10.9.6.2" }).event)).rejects.toMatchObject({ statusCode: 401 });
    await expect(systemInfoHandler(makeAuthEvent({ peer: "10.9.6.3" }).event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("popular-contents / recent-comments / system-info:DB 异常 → 500", async () => {
    const session = await loginSessionCookie();
    const ev = (peer: string) => makeAuthEvent({ method: "GET", cookie: session, peer }).event;

    sharedFake.on("contents", "findMany", async () => { throw new Error("db down"); });
    await expect(popularHandler(ev("10.9.6.4"))).rejects.toMatchObject({ statusCode: 500 });

    sharedFake.on("comments", "findMany", async () => { throw new Error("db down"); });
    await expect(recentCommentsHandler(ev("10.9.6.5"))).rejects.toMatchObject({ statusCode: 500 });

    sharedFake.on("attachments", "findMany", async () => { throw new Error("db down"); });
    await expect(systemInfoHandler(ev("10.9.6.6"))).rejects.toMatchObject({ statusCode: 500 });
  });
});
