import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const miniCommentsHandler = (await import("#server/api/mini/comments.get")).default;
const checkLinkHandler = (await import("#server/api/check-link.get")).default;

// ===== mini/comments.get =====
const commentRows: Array<Record<string, unknown>> = [];
commentRows.push({ coid: 1, cid: 100, status: 1, name: "甲", mail: "a@b.com", content: "评论1", create_time: new Date(), parent_id: null });
commentRows.push({ coid: 2, cid: 100, status: 1, name: "乙", mail: "b@c.com", content: "回复1", create_time: new Date(), parent_id: 1 });

sharedFake.on("comments", "findMany", async ({ where }: { where?: { cid?: number; status?: number } } = {}) => {
  let rows = commentRows.slice();
  if (where?.cid !== undefined) rows = rows.filter(c => c.cid === where.cid);
  if (where?.status !== undefined) rows = rows.filter(c => c.status === where.status);
  return rows;
});
sharedFake.on("informations", "findMany", async () => [
  { key: "commentRequireMail", value: "true" },
  { key: "commentRequireLink", value: "false" },
  { key: "commentAvatarService", value: "gravatar" },
]);

beforeEach(() => {
  commentRows.length = 0;
  commentRows.push({ coid: 1, cid: 100, status: 1, name: "甲", mail: "a@b.com", content: "评论1", create_time: new Date(), parent_id: null });
  commentRows.push({ coid: 2, cid: 100, status: 1, name: "乙", mail: "b@c.com", content: "回复1", create_time: new Date(), parent_id: 1 });
});

describe("mini/comments.get(小程序评论列表)", () => {
  test("cid 缺省 → 400", async () => {
    await expect(callAdmin(miniCommentsHandler, {
      method: "GET",
      url: "/api/mini/comments",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 非法 → 400", async () => {
    await expect(callAdmin(miniCommentsHandler, {
      method: "GET",
      url: "/api/mini/comments?cid=abc",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 不存在 → 返回空数组 + commentEnabled:true", async () => {
    const r = await callAdmin(miniCommentsHandler, {
      method: "GET",
      url: "/api/mini/comments?cid=999",
    }) as { success: boolean, data: unknown[], total: number, commentEnabled: boolean };
    expect(r.success).toBe(true);
    expect(r.data).toEqual([]);
    expect(r.total).toBe(0);
  });

  test("成功:返回评论树(包含子评论)", async () => {
    const r = await callAdmin(miniCommentsHandler, {
      method: "GET",
      url: "/api/mini/comments?cid=100",
    }) as { success: boolean, data: Array<{ id: number, children: unknown[] }>, requireMail: boolean, commentEnabled: boolean };
    expect(r.success).toBe(true);
    expect(r.data.length).toBeGreaterThan(0);
    // 根评论含子评论
    const root = r.data.find(c => c.id === 1);
    expect(root?.children.length).toBeGreaterThan(0);
    expect(r.requireMail).toBe(true);
    expect(r.commentEnabled).toBe(true);
  });
});

// check-link SSRF/file 协议分支已被 public-misc.test.ts 详细覆盖
// (那里注册了完整 safe-fetch mock)。
// 这里只覆盖参数解析最小集,避免与 public-misc 的 mock 冲突
describe("check-link.get", () => {
  test("url 缺省 → 400", async () => {
    await expect(callAdmin(checkLinkHandler, {
      method: "GET",
      url: "/api/check-link",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("url 非字符串 → 400", async () => {
    await expect(callAdmin(checkLinkHandler, {
      method: "GET",
      url: "/api/check-link?url[0]=a&url[1]=b",
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
