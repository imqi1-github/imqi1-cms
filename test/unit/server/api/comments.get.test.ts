import "#test/helpers/nitro-globals";

import { createHash } from "node:crypto";

import { describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// IP 库文件在测试环境不可依赖,mock 掉聚焦 handler 逻辑
mockSharedPrisma();
mock.module("#server/utils/qqwry", () => ({ getIpLocation: async () => null }));

const AVATAR_MD5 = createHash("md5").update("a@b.c".toLowerCase().trim()).digest("hex");
sharedFake.on("informations", "findUnique", (args: { where: { key: string } }) => {
  if (args.where.key === "commentAvatarService") return { value: "gravatar" };
  return null;
});
sharedFake.on("comments", "findMany", () => [
  { coid: 10, cid: 1, name: "根评论者", mail: "a@b.c", link: "https://x.com", content: "根评论", create_time: new Date("2026-01-01T00:00:00Z"), status: 1, parent_id: null, agent: "Mozilla/5.0 Chrome/120.0", ip: "1.2.3.4" },
  { coid: 11, cid: 1, name: "子评论者", mail: null, link: null, content: "子评论", create_time: new Date("2026-01-02T00:00:00Z"), status: 1, parent_id: 10, agent: "MicroMessenger/8.0", ip: null },
  { coid: 12, cid: 1, name: "孤儿", mail: null, link: null, content: "父已删", create_time: new Date("2026-01-03T00:00:00Z"), status: 1, parent_id: 999, agent: "", ip: null },
]);

const handler = (await import("#server/api/comments.get")).default as unknown as (e: unknown) => Promise<{ code: number; data: unknown[]; pagination: Record<string, unknown> }>;

function call(url: string) {
  return handler({ path: url, node: { req: { url, headers: {} } } });
}

describe("comments.get:参数校验与回退", () => {
  test.each(["", "?page=1", "?cid=0", "?cid=abc", "?cid=-1"])("%s → 400 缺少文章ID", async url => {
    await expect(call(`/api/comments${url}`)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("page 负数/NaN 回退 1;pageSize 越界钳制到上限", async () => {
    const r1 = await call("/api/comments?cid=1&page=-5");
    expect(r1.pagination.page).toBe(1);
    const r2 = await call("/api/comments?cid=1&pageSize=99999");
    expect(r2.pagination.pageSize).toBeLessThanOrEqual(10000);
  });
});

describe("comments.get:评论树与分页", () => {
  test("准备:拉一次完整列表", async () => {
    const r = await call("/api/comments?cid=1&page=1&pageSize=10");
    expect(r.code).toBe(200);
  });

  test("子评论挂进 parent.children 并带 parent_name", async () => {
    const r = await call("/api/comments?cid=1&page=1&pageSize=10");
    const roots = r.data as Array<{ coid: number; children: Array<{ coid: number; parent_name: string | null }>; parent_name: unknown }>;
    const root = roots.find(c => c.coid === 10);
    expect(root?.children.map(c => c.coid)).toEqual([11]);
    expect(root?.children[0]?.parent_name).toBe("根评论者");
  });

  test("父已删除的评论上提为根(parent 不在 map 时)", async () => {
    const r = await call("/api/comments?cid=1&page=1&pageSize=10");
    const roots = r.data as Array<{ coid: number }>;
    expect(roots.map(c => c.coid)).toContain(12);
  });

  test("分页按根评论计,totalAllComments 含子评论", async () => {
    const r = await call("/api/comments?cid=1&page=1&pageSize=10");
    expect(r.pagination.total).toBe(2);
    expect(r.pagination.totalAllComments).toBe(3);
    expect(r.pagination.totalPages).toBe(1);
    expect(r.pagination.hasMore).toBe(false);
  });
});

describe("comments.get:白名单与隐私字段(硬性约定 #1)", () => {
  test("响应不出现 mail/ip/agent 键;头像服务端算好,UA 预解析", async () => {
    const r = await call("/api/comments?cid=1");
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('"mail"');
    expect(json).not.toContain('"ip"');
    expect(json).not.toContain('"agent"');
    expect(json).toContain(AVATAR_MD5);
    expect(json).toContain("微信");
  });

  test("空邮箱头像为空串(前端不渲染 img)", async () => {
    const r = await call("/api/comments?cid=1");
    const child = (r.data as Array<{ children: Array<{ avatar: string }> }>)[0]?.children?.[0];
    expect(child?.avatar).toBe("");
  });
});
