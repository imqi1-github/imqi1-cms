import { beforeEach, describe, expect, mock, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// mock mail (异步通知)
mock.module("#server/utils/mail", () => ({
  notifyAdminNewComment: async () => {},
  notifyAdminPendingComment: async () => {},
  notifyCommentReply: async () => {},
}));

mockSharedPrisma();

const postHandler = (await import("#server/api/mini/comments.post")).default;

// contents/comments/informations 假件
const contentRows: Array<{ cid: number; status: number; type: number }> = [];
contentRows.push({ cid: 100, status: 1, type: 0 });
const commentRows: Array<Record<string, unknown>> = [];
const infoRows: Array<{ key: string; value: string }> = [];

infoRows.push({ key: "commentInterval", value: "60" });
infoRows.push({ key: "commentRequireMail", value: "false" });
infoRows.push({ key: "commentRequireLink", value: "false" });
infoRows.push({ key: "commentAvatarService", value: "gravatar" });
infoRows.push({ key: "commentModeration", value: "false" });

sharedFake.on("contents", "findFirst", async ({ where }: { where?: Record<string, unknown> } = {}) => {
  if (where?.cid !== undefined) return contentRows.find(c => c.cid === where.cid) ?? null;
  return null;
});
sharedFake.on("contents", "create", async () => ({}));
sharedFake.on("contents", "update", async () => ({}));
sharedFake.on("comments", "findFirst", async ({ where }: { where?: { ip?: string; coid?: number; cid?: number; parent_id?: number } } = {}) => {
  if (where?.ip !== undefined) return null; // 无 IP 间隔
  if (where?.coid !== undefined && where?.cid !== undefined) {
    return commentRows.find(c => c.coid === where.coid && c.cid === where.cid) ?? null;
  }
  if (where?.coid !== undefined) return commentRows.find(c => c.coid === where.coid) ?? null;
  return null;
});
sharedFake.on("comments", "create", async ({ data }: { data: Record<string, unknown> }) => {
  const coid = commentRows.length + 1;
  commentRows.push({ coid, ...data });
  return { coid, ...data };
});
sharedFake.on("comments", "findUnique", async ({ where }: { where: { coid: number } } = { where: { coid: 0 } }) =>
  commentRows.find(c => c.coid === where.coid) ?? null);
sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } } = { where: { key: "" } }) => {
  return infoRows.find(r => r.key === where.key) ?? null;
});
sharedFake.on("informations", "findMany", async () => infoRows.map(r => ({ ...r })));

beforeEach(() => {
  contentRows.length = 0;
  contentRows.push({ cid: 100, status: 1, type: 0 });
  commentRows.length = 0;
  infoRows.length = 0;
  infoRows.push({ key: "commentInterval", value: "60" });
  infoRows.push({ key: "commentRequireMail", value: "false" });
  infoRows.push({ key: "commentRequireLink", value: "false" });
  infoRows.push({ key: "commentAvatarService", value: "gravatar" });
  infoRows.push({ key: "commentModeration", value: "false" });
});

describe("mini/comments.post(小程序提交评论)", () => {
  test("body 缺省 → 400", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      url: "/api/mini/comments",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 缺省 → 400", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { content: "x", name: "甲" },
      url: "/api/mini/comments",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("content 空 → 400", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "", name: "甲" },
      url: "/api/mini/comments",
    })).rejects.toThrow(/必填/);
  });

  test("蜜罐命中(website 字段)→ 静默成功,不写库", async () => {
    const r = await callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "x", name: "甲", website: "https://spam.example" },
      url: "/api/mini/comments",
    }) as { success: boolean, data: { needModeration: boolean } };
    expect(r.success).toBe(true);
    expect(commentRows).toHaveLength(0);
  });

  test("目标文章不存在 → 404", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { cid: 999, content: "x", name: "甲" },
      url: "/api/mini/comments",
    })).rejects.toThrow();
  });

  test("email 格式错(需要时)→ 400", async () => {
    infoRows.find(r => r.key === "commentRequireMail")!.value = "true";
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "x", name: "甲", mail: "not-email" },
      url: "/api/mini/comments",
    })).rejects.toThrow(/邮箱/);
  });

  test("link 协议非 http/https → 400", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "x", name: "甲", link: "javascript:alert(1)" },
      url: "/api/mini/comments",
    })).rejects.toThrow(/链接/);
  });

  test("成功:needModeration=false(自动发布)", async () => {
    const r = await callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "好评论", name: "小明" },
      url: "/api/mini/comments",
    }) as { success: boolean, data: { needModeration: boolean }, message: string };
    expect(r.success).toBe(true);
    expect(r.data.needModeration).toBe(false);
    expect(r.message).toContain("成功");
  });

  test("成功:人工审核开关 → needModeration=true", async () => {
    infoRows.find(r => r.key === "commentModeration")!.value = "true";
    const r = await callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "待审评论", name: "访客" },
      url: "/api/mini/comments",
    }) as { data: { needModeration: boolean }, message: string };
    expect(r.data.needModeration).toBe(true);
    expect(r.message).toContain("审核");
  });

  test("成功:回复已存在父评论", async () => {
    commentRows.push({ coid: 1, cid: 100, name: "父君", mail: null, content: "父", parent_id: null });
    const r = await callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "回复", name: "子", parent_id: 1 },
      url: "/api/mini/comments",
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("回复不存在父评论 → 400", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { cid: 100, content: "回复", name: "子", parent_id: 999 },
      url: "/api/mini/comments",
    })).rejects.toThrow(/回复/);
  });
});