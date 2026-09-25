import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
// qqwry IP 库文件在测试环境不可依赖
mock.module("#server/utils/qqwry", () => ({ getIpLocation: async () => ({ location: "中国-辽宁-沈阳", isp: "联通" }) }));

// comments 内存表(含 content_ref 关联文章与评论计数联动)
interface CommentRow { coid: number; cid: number; name: string; mail: string; link: string | null; content: string; create_time: Date; status: number; parent_id: number | null; agent: string | null; ip: string | null }
let comments: CommentRow[] = [];
let contentCounts = new Map<number, number>();

function seedComments(): void {
  comments = [
    { coid: 1, cid: 10, name: "访客甲", mail: "jia@x.com", link: null, content: "第一条", create_time: new Date("2026-01-01T00:00:00Z"), status: 1, parent_id: null, agent: "Mozilla/5.0 Chrome/120.0", ip: "1.2.3.4" },
    { coid: 2, cid: 10, name: "访客乙", mail: "yi@x.com", link: "https://y.com", content: "待审评论", create_time: new Date("2026-01-02T00:00:00Z"), status: 0, parent_id: null, agent: "", ip: null },
  ];
  contentCounts = new Map([[10, 1]]);
}

sharedFake.on("comments", "findMany", async ({ where }: { where: Record<string, unknown> }) =>
  comments
    .filter(c => (where.status === undefined || c.status === where.status) && (where.cid === undefined || c.cid === where.cid))
    .map(c => ({
      ...c,
      content_ref: { cid: c.cid, title: `文章${c.cid}`, slug: `post-${c.cid}`, status: 1, contentrelations: [{ metas: { slug: "note" } }] },
    })));
sharedFake.on("comments", "count", async ({ where }: { where: Record<string, unknown> }) =>
  comments.filter(c => (where.status === undefined || c.status === where.status) && (where.cid === undefined || c.cid === where.cid)).length);
sharedFake.on("comments", "findUnique", async ({ where }: { where: { coid: number } }) => {
  const row = comments.find(c => c.coid === where.coid);
  return row ? { ...row } : null;
});
sharedFake.on("comments", "update", async ({ where, data }: { where: { coid: number }; data: Partial<CommentRow> }) => {
  const row = comments.find(c => c.coid === where.coid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  Object.assign(row, data);
  // 模拟 handler 的 select 白名单:不含 mail/ip/agent
  return {
    coid: row.coid, cid: row.cid, name: row.name, link: row.link, content: row.content,
    create_time: row.create_time, status: row.status, parent_id: row.parent_id,
    content_ref: { cid: row.cid, title: `文章${row.cid}`, slug: `post-${row.cid}` },
  };
});
sharedFake.on("comments", "delete", async ({ where }: { where: { coid: number } }) => {
  const i = comments.findIndex(c => c.coid === where.coid);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  comments.splice(i, 1);
  return {};
});
sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }; data: { comment_num: { increment?: number; decrement?: number } } }) => {
  const cur = contentCounts.get(where.cid) ?? 0;
  if (data.comment_num.increment) contentCounts.set(where.cid, cur + data.comment_num.increment);
  if (data.comment_num.decrement) contentCounts.set(where.cid, cur - data.comment_num.decrement);
  return {};
});
sharedFake.on("informations", "findUnique", (args: { where: { key: string } }) => {
  if (args.where.key === "commentAvatarService") return { value: "gravatar" };
  if (args.where.key === "sessionStoreType") return { value: "memory" };
  return null;
});

beforeEach(seedComments);

const getComments = (await import("#server/api/admin/comments.get")).default;
const patchComment = (await import("#server/api/admin/comments/[id].patch")).default;
const deleteComment = (await import("#server/api/admin/comments/[id].delete")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}
const H = () => ({ "x-csrf-token": CSRF_TOKEN });

describe("admin/comments.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(getComments, {})).rejects.toMatchObject({ statusCode: 401 });
  });

  test("列表:服务端算头像与归属地,status 筛选与分页", async () => {
    const r = (await callAdmin(getComments, { method: "GET", cookie: await cookie() })) as {
      data: Array<Record<string, unknown>>;
      pagination: Record<string, number>;
    };
    expect(r.data).toHaveLength(2);
    expect(r.pagination.total).toBe(2);
    // 白名单:mail/ip/agent 仅供服务端消费,不下发原始值;头像/归属地服务端算好
    const row = r.data[0]!;
    expect(row.avatarUrl).toContain("gravatar.com/avatar");
    expect(row.location).toBe("沈阳");
    expect(row.isp).toBe("联通");
  });

  test("status 筛选只回该状态", async () => {
    const r = (await callAdmin(getComments, { method: "GET", url: "/api/admin/comments?status=0", cookie: await cookie() })) as { data: Array<Record<string, unknown>> };
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.status).toBe(0);
  });

  test("分页参数钳制(page 负数回 1,pageSize 上限)", async () => {
    const r = (await callAdmin(getComments, { method: "GET", url: "/api/admin/comments?page=-3&pageSize=99999", cookie: await cookie() })) as { pagination: Record<string, number> };
    expect(r.pagination.page).toBe(1);
    expect(r.pagination.pageSize).toBeLessThanOrEqual(10000);
  });
});

describe("admin/comments/[id].patch", () => {
  test("未登录/CSRF 缺失/非法 id → 401/403/400", async () => {
    await expect(callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, cookie: session, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(patchComment, { method: "PATCH", params: { id: "abc" }, cookie: await cookie(), body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("字段类型非法 → 400;status 非法枚举 → 400", async () => {
    const c = await cookie();
    await expect(callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: 123, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, cookie: c, body: { status: "yes", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, cookie: c, body: { status: 9, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("状态 0→1 成功,并给文章评论计数 +1", async () => {
    expect(contentCounts.get(10)).toBe(1);
    const r = (await callAdmin(patchComment, { method: "PATCH", params: { id: "2" }, cookie: await cookie(), body: { status: 1, csrfToken: CSRF_TOKEN } })) as { success: boolean };
    expect(r.success).toBe(true);
    expect(contentCounts.get(10)).toBe(2);
  });

  test("状态 1→0 成功,评论计数 -1", async () => {
    await callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, cookie: await cookie(), body: { status: 0, csrfToken: CSRF_TOKEN } });
    expect(contentCounts.get(10)).toBe(0);
  });

  test("状态不变时计数不动;404 不存在", async () => {
    await callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, cookie: await cookie(), body: { status: 1, csrfToken: CSRF_TOKEN } });
    expect(contentCounts.get(10)).toBe(1);
    await expect(callAdmin(patchComment, { method: "PATCH", params: { id: "999" }, cookie: await cookie(), body: { status: 1, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("更新后响应不含 mail/ip/agent(白名单)", async () => {
    const r = (await callAdmin(patchComment, { method: "PATCH", params: { id: "1" }, cookie: await cookie(), body: { content: "改后内容", csrfToken: CSRF_TOKEN } })) as { data: Record<string, unknown> };
    expect(JSON.stringify(r.data)).not.toContain('"mail"');
    expect(JSON.stringify(r.data)).not.toContain('"ip"');
    expect(JSON.stringify(r.data)).not.toContain('"agent"');
  });
});

describe("admin/comments/[id].delete", () => {
  test("未登录 → 401;CSRF 走 header", async () => {
    await expect(callAdmin(deleteComment, { method: "DELETE", params: { id: "1" } })).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(deleteComment, { method: "DELETE", params: { id: "1" }, cookie: session })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("删除已发布评论:计数 -1;404 不存在", async () => {
    const c = await cookie();
    expect(contentCounts.get(10)).toBe(1);
    await expect(callAdmin(deleteComment, { method: "DELETE", params: { id: "1" }, cookie: c, headers: H() })).resolves.toMatchObject({ success: true });
    expect(contentCounts.get(10)).toBe(0);
    await expect(callAdmin(deleteComment, { method: "DELETE", params: { id: "999" }, cookie: c, headers: H() })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("删除待审评论(status=0)不影响计数", async () => {
    const c = await cookie();
    await callAdmin(deleteComment, { method: "DELETE", params: { id: "2" }, cookie: c, headers: H() });
    expect(contentCounts.get(10)).toBe(1);
  });
});
