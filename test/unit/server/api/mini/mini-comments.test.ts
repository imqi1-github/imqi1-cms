import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let commentsEnabled = true;
const realMiniFake = await import("#server/utils/mini-fake-data");
mock.module("#server/utils/mini-fake-data", () => ({
  ...realMiniFake,
  isMiniFakeDataEnabled: () => false,
  miniCommentsEnabled: () => commentsEnabled,
}));

// 百度审核:可控
let auditEnabled = false;
let auditConclusion = "合规";
let auditConclusionType = 1;
mock.module("#server/utils/baidu-audit", () => ({
  getAuditConfig: async () => ({ enabled: auditEnabled }),
  auditText: async () => ({ conclusion: auditConclusion, conclusionType: auditConclusionType }),
  mapAuditResultToStatus: (t: number) => (t === 1 ? 1 : 0),
}));

// 邮件通知:外部副作用,统一吞掉
mock.module("#server/utils/mail", () => ({
  notifyAdminPendingComment: async () => {},
  notifyAdminNewComment: async () => {},
  notifyCommentReply: async () => {},
}));

// 站点设置(评论必填项):siteSettings 真实读 informations,这里用假数据控制,
// 不 mock 模块(工厂里 spread 真模块会解析到 mock 自身 → 无限递归)
let settings = { commentRequireMail: false, commentRequireLink: false, commentAvatarService: "gravatar" };

const contentsRows = [{ cid: 10 }];
sharedFake.on("contents", "findFirst", async ({ where }: { where: { cid: number } }) =>
  contentsRows.find(c => c.cid === where.cid) ? { cid: where.cid } : null);
sharedFake.on("contents", "update", async () => ({}));

let infoMap = new Map<string, string>([["commentInterval", "0"], ["commentModeration", "false"]]);
sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) =>
  infoMap.has(where.key) ? { value: infoMap.get(where.key)! } : null);

const created: Array<Record<string, unknown>> = [];
const resetCreated = () => { created.length = 0; };
let commentRows: Array<Record<string, unknown>> = [];
sharedFake.on("comments", "create", async ({ data }: { data: Record<string, unknown> }) => {
  const row = { coid: created.length + 1, ...data };
  created.push(row);
  return row;
});
sharedFake.on("comments", "findMany", async ({ where }: { where: { cid: number; status: number } }) =>
  commentRows.filter(c => c.cid === where.cid && c.status === where.status).map(c => ({ ...c })));
sharedFake.on("comments", "findFirst", async ({ where }: { where: { coid?: number; cid?: number; ip?: string } }) => {
  if (where.ip !== undefined) return null; // 间隔防刷:默认无近期评论
  return commentRows.find(c => c.coid === where.coid && c.cid === where.cid) ?? null;
});
sharedFake.on("comments", "findUnique", async () => null);
sharedFake.on("$transaction", async (opsOrFn: unknown) =>
  typeof opsOrFn === "function" ? await (opsOrFn as (tx: unknown) => Promise<unknown>)(sharedFake.prisma) : opsOrFn);

const getHandler = (await import("#server/api/mini/comments.get")).default;
const postHandler = (await import("#server/api/mini/comments.post")).default;

function getEv(peer: string, cid = 10) {
  return makeAuthEvent({ method: "GET", peer, url: `/api/mini/comments?cid=${cid}`, headers: { host: "imqi1.com" } }).event;
}
function postEv(peer: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return makeAuthEvent({ method: "POST", peer, body, headers: { host: "imqi1.com", ...headers } }).event;
}

beforeEach(() => {
  commentsEnabled = true;
  auditEnabled = false;
  auditConclusion = "合规";
  auditConclusionType = 1;
  settings = { commentRequireMail: false, commentRequireLink: false, commentAvatarService: "gravatar" };
  infoMap = new Map([["commentInterval", "0"], ["commentModeration", "false"]]);
  // commentRequireMail/Link 由 siteSettings 从 informations 读;用假数据控制
  sharedFake.on("informations", "findMany", async () => [
    { key: "commentRequireMail", value: String(settings.commentRequireMail) },
    { key: "commentRequireLink", value: String(settings.commentRequireLink) },
    { key: "commentAvatarService", value: "gravatar" },
  ]);
  resetCreated();
  commentRows = [
    { coid: 1, cid: 10, name: "甲", mail: "a@b.c", content: "根评论", create_time: new Date("2026-01-01T00:00:00Z"), parent_id: null, status: 1 },
    { coid: 2, cid: 10, name: "乙", mail: null, content: "子评论", create_time: new Date("2026-01-02T00:00:00Z"), parent_id: 1, status: 1 },
    { coid: 3, cid: 10, name: "待审", mail: null, content: "未过审", create_time: new Date("2026-01-03T00:00:00Z"), parent_id: null, status: 0 },
  ];
});

describe("mini/comments.get", () => {
  test("评论开关关闭:返回空列表且 commentEnabled=false", async () => {
    commentsEnabled = false;
    const r = (await getHandler(getEv("10.9.10.1"))) as unknown as { data: unknown[]; commentEnabled: boolean };
    expect(r.data).toEqual([]);
    expect(r.commentEnabled).toBe(false);
  });

  test("cid 缺失/非法 → 400", async () => {
    await expect(getHandler(getEv("10.9.10.2", 0))).rejects.toMatchObject({ statusCode: 400 });
  });

  test("只取已过审评论,构建父子树,不下发 mail", async () => {
    const r = (await getHandler(getEv("10.9.10.3"))) as unknown as {
      data: Array<{ id: number; children: Array<{ id: number }> }>;
      total: number;
      requireMail: boolean;
    };
    expect(r.total).toBe(2);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.id).toBe(1);
    expect(r.data[0]!.children.map(c => c.id)).toEqual([2]);
    expect(JSON.stringify(r)).not.toContain("a@b.c");
  });
});

describe("mini/comments.post", () => {
  test("评论开关关闭 → 403", async () => {
    commentsEnabled = false;
    await expect(postHandler(postEv("10.9.10.4", { cid: 10, content: "x", name: "n" }))).rejects.toMatchObject({ statusCode: 403 });
  });

  test("必填缺失/内容过长 → 400;目标文章不存在 → 404", async () => {
    await expect(postHandler(postEv("10.9.10.5", { cid: 10, content: "", name: "n" }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(postHandler(postEv("10.9.10.6", { cid: 10, content: "x".repeat(5001), name: "n" }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(postHandler(postEv("10.9.10.7", { cid: 999, content: "x", name: "n" }))).rejects.toMatchObject({ statusCode: 404 });
  });

  test("蜜罐命中:静默成功,不写库", async () => {
    const r = (await postHandler(postEv("10.9.10.8", { cid: 10, content: "x", name: "n", website: "http://spam" }))) as unknown as { success: boolean };
    expect(r.success).toBe(true);
    expect(created).toHaveLength(0);
  });

  test("必填邮箱/链接(跟随主站设置)→ 400", async () => {
    settings = { commentRequireMail: true, commentRequireLink: false, commentAvatarService: "gravatar" };
    await expect(postHandler(postEv("10.9.10.9", { cid: 10, content: "x", name: "n" }))).rejects.toMatchObject({ statusCode: 400, message: "请填写邮箱" });

    settings = { commentRequireMail: false, commentRequireLink: true, commentAvatarService: "gravatar" };
    await expect(postHandler(postEv("10.9.10.10", { cid: 10, content: "x", name: "n" }))).rejects.toMatchObject({ statusCode: 400, message: "请填写链接" });
  });

  test("X-Client-Platform: mini → agent 记为 Mini", async () => {
    await postHandler(postEv("10.9.10.11", { cid: 10, content: "来自小程序", name: "小程序用户" }, { "x-client-platform": "mini" }));
    expect(created[0]!.agent).toBe("Mini");
    expect(created[0]!.status).toBe(1);
  });

  test("人工审核开关开启 → 落库待审(status 0)且 needModeration", async () => {
    infoMap.set("commentModeration", "true");
    const r = (await postHandler(postEv("10.9.10.12", { cid: 10, content: "待审内容", name: "n" }))) as unknown as { data: { needModeration: boolean } };
    expect(created[0]!.status).toBe(0);
    expect(r.data.needModeration).toBe(true);
  });

  test("百度审核:通过则直接发布;审核服务异常 → fail-closed 置待审", async () => {
    auditEnabled = true;
    auditConclusionType = 1;
    await postHandler(postEv("10.9.10.13", { cid: 10, content: "合规内容", name: "n" }));
    expect(created[0]!.status).toBe(1);

    auditConclusion = "审核服务异常";
    await postHandler(postEv("10.9.10.14", { cid: 10, content: "异常时内容", name: "n" }));
    expect(created[1]!.status).toBe(0);
  });

  test("IP 间隔防刷:近期有同 IP 评论 → 429", async () => {
    infoMap.set("commentInterval", "60");
    sharedFake.on("comments", "findFirst", async ({ where }: { where: { ip?: string; coid?: number } }) =>
      where.ip !== undefined ? { create_time: new Date() } : null);
    await expect(postHandler(postEv("10.9.10.15", { cid: 10, content: "太快了", name: "n" }))).rejects.toMatchObject({ statusCode: 429 });
  });

  test("回复不存在的父评论 → 400", async () => {
    await expect(postHandler(postEv("10.9.10.16", { cid: 10, content: "回复", name: "n", parent_id: 999 }))).rejects.toMatchObject({ statusCode: 400 });
  });
});
