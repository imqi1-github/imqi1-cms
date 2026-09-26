import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, makeAuthEvent, setCaptchaAccept } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== 邮件通知:只记录调用 =====
const mailCalls: Record<string, unknown[][]> = { new: [], pending: [], reply: [] };
mock.module("#server/utils/mail", () => ({
  notifyAdminNewComment: (...a: unknown[]) => mailCalls.new.push(a),
  notifyAdminPendingComment: (...a: unknown[]) => mailCalls.pending.push(a),
  notifyCommentReply: (...a: unknown[]) => mailCalls.reply.push(a),
}));

// ===== 百度审核:开关与结论可控,映射函数保持真实实现 =====
const realAudit = await import("#server/utils/baidu-audit");
let auditEnabled = false;
let auditConclusion = 1;
const auditTexts: string[] = [];
mock.module("#server/utils/baidu-audit", () => ({
  ...realAudit,
  getAuditConfig: async () => ({ enabled: auditEnabled, apiKey: "k", secretKey: "s", checkAdmin: false }),
  auditText: async (text: string) => {
    auditTexts.push(text);
    return { conclusionType: auditConclusion, conclusion: "ok" };
  },
}));

// ===== prisma 假件 =====
let targetContent: { cid: number; status: number } | null = { cid: 1, status: 1 };
let commentSettings: Record<string, string> = {};
let intervalRow: { create_time: Date } | null = null;
let parentRow: { coid: number; parent_id: number | null } | null = null;
let ancestorChain: Record<number, number | null> = {};
const created: Array<Record<string, unknown>> = [];
const counterUpdates: Array<Record<string, unknown>> = [];

sharedFake.on("contents", "findUnique", async () => targetContent);
sharedFake.on("informations", "findMany", async ({ where }: { where: { key: { in: string[] } } }) =>
  where.key.in.filter(k => commentSettings[k] !== undefined).map(k => ({ key: k, value: commentSettings[k] })));
sharedFake.on("informations", "findUnique", ({ where }: { where: { key: string } }) => {
  if (where.key === "commentModeration") return commentSettings.__moderation === "true" ? { value: "true" } : null;
  if (where.key === "sessionStoreType") return { value: "memory" };
  return null;
});
sharedFake.on("comments", "findFirst", async ({ where }: { where: { ip?: string; coid?: number } }) => {
  if (where.ip) return intervalRow ? { ...intervalRow } : null;
  if (where.coid !== undefined) return parentRow && parentRow.coid === where.coid ? { ...parentRow } : null;
  return null;
});
sharedFake.on("comments", "findUnique", async ({ where }: { where: { coid: number } }) => {
  if (where.coid in ancestorChain) return { parent_id: ancestorChain[where.coid] };
  return null;
});
sharedFake.on("comments", "create", async ({ data }: { data: Record<string, unknown> }) => {
  created.push({ ...data });
  return { coid: 777, ...data };
});
sharedFake.on("contents", "update", async ({ data }: { data: Record<string, unknown> }) => {
  counterUpdates.push(data);
  return {};
});
sharedFake.on("$transaction", async (fn: unknown) => (typeof fn === "function" ? await (fn as (tx: unknown) => Promise<unknown>)(sharedFake.prisma) : fn));

const handler = (await import("#server/api/comments.post")).default;

function call(body: Record<string, unknown>, opts: { cookie?: string; peer?: string; ua?: string } = {}) {
  const { event } = makeAuthEvent({
    method: "POST",
    peer: opts.peer ?? "10.7.0.1",
    body,
    cookie: opts.cookie ?? CSRF_COOKIE,
    headers: opts.ua ? { "user-agent": opts.ua } : {},
    url: "/api/comments",
  });
  return handler(event) as Promise<Record<string, unknown>>;
}
const validBody = () => ({ csrfToken: CSRF_TOKEN, cid: 1, content: "正常评论", name: "小明" });

beforeEach(() => {
  targetContent = { cid: 1, status: 1 };
  commentSettings = {};
  intervalRow = null;
  parentRow = null;
  ancestorChain = {};
  created.length = 0;
  counterUpdates.length = 0;
  auditEnabled = false;
  auditConclusion = 1;
  auditTexts.length = 0;
  mailCalls.new.length = 0;
  mailCalls.pending.length = 0;
  mailCalls.reply.length = 0;
  setCaptchaAccept(true);
});

describe("comments.post:入口校验", () => {
  test("zod 校验失败(缺 csrfToken/cid=0) → 400 请求体验证失败", async () => {
    await expect(call({ cid: 1, content: "x", name: "a" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ ...validBody(), csrfToken: CSRF_TOKEN, cid: 0 })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 不匹配 → 403", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: "10.7.0.2", body: { ...validBody(), csrfToken: "wrong" }, cookie: CSRF_COOKIE, url: "/api/comments" });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("蜜罐字段填充 → 静默成功,不写库", async () => {
    const r = await call({ ...validBody(), website: "https://spam.example" });
    expect(r.code).toBe(200);
    expect(created).toHaveLength(0);
  });

  test("游客验证码错误 → 400;通过则放行", async () => {
    setCaptchaAccept(false);
    await expect(call({ ...validBody(), captcha: "bad" })).rejects.toMatchObject({ statusCode: 400, message: "验证码错误或已过期" });
    setCaptchaAccept(true);
    const r = await call({ ...validBody(), captcha: "ok" });
    expect(r.code).toBe(200);
  });

  test("目标文章不存在/未发布 → 404", async () => {
    targetContent = null;
    await expect(call(validBody())).rejects.toMatchObject({ statusCode: 404 });
    targetContent = { cid: 1, status: 0 };
    await expect(call(validBody())).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("comments.post:站点设置", () => {
  test("评论总开关关闭 → 403", async () => {
    commentSettings = { commentEnabled: "false" };
    await expect(call(validBody())).rejects.toMatchObject({ statusCode: 403 });
  });

  test("必填邮箱/链接跟随设置 → 400", async () => {
    commentSettings = { commentRequireMail: "true" };
    await expect(call(validBody())).rejects.toMatchObject({ statusCode: 400, message: "请填写邮箱" });
    commentSettings = { commentRequireLink: "true" };
    await expect(call({ ...validBody(), mail: "a@b.c" })).rejects.toMatchObject({ statusCode: 400, message: "请填写链接" });
  });

  test("IP 间隔内已评论 → 响应 code 429 带剩余秒数", async () => {
    intervalRow = { create_time: new Date(Date.now() - 30_000) };
    const r = await call(validBody());
    expect(r.code).toBe(429);
    expect(String(r.message)).toMatch(/评论太频繁/);
    expect(created).toHaveLength(0);
  });

  test("邮箱/链接格式 → 400", async () => {
    await expect(call({ ...validBody(), mail: "not-an-email" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ ...validBody(), link: "javascript:alert(1)" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ ...validBody(), link: "not a url" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("comments.post:回复层级", () => {
  test("回复的评论不存在/不属于该文章 → 400", async () => {
    parentRow = null;
    await expect(call({ ...validBody(), parent_id: 999 })).rejects.toMatchObject({ statusCode: 400, message: "回复的评论不存在" });
  });

  test("超过最大回复层级 → 400", async () => {
    // 父评论本身是第 2 层(parent_id=5,5 无父) → 本条会落在第 3 层,maxLevel 2 拒绝
    commentSettings = { commentMaxLevel: "2" };
    parentRow = { coid: 10, parent_id: 5 };
    ancestorChain = { 5: null };
    await expect(call({ ...validBody(), parent_id: 10 })).rejects.toMatchObject({ statusCode: 400, message: "已达到最大回复层级" });
  });

  test("层级未超限:父链上溯写入成功", async () => {
    parentRow = { coid: 10, parent_id: null };
    const r = await call({ ...validBody(), parent_id: 10 });
    expect(r.code).toBe(200);
    expect(created[0]!.parent_id).toBe(10);
  });
});

describe("comments.post:写入与通知", () => {
  test("直发成功:内容净化/计数原子累加/站主通知", async () => {
    const r = await call({ ...validBody(), content: "<b>加粗</b><script>evil()</script>", mail: "a@b.c" }, { ua: "Mozilla/5.0 Test" });
    expect(r.code).toBe(200);
    expect(r.needModeration).toBe(false);
    expect(created).toHaveLength(1);
    // isomorphic-dompurify:危险标签连内容一起剔除,正文文本保留
    expect(String(created[0]!.content)).toContain("加粗");
    expect(String(created[0]!.content)).not.toContain("<script>");
    expect(String(created[0]!.content)).not.toContain("evil");
    expect(created[0]!.status).toBe(1);
    expect(created[0]!.ip).toBe("10.7.0.1");
    expect(created[0]!.agent).toBe("Mozilla/5.0 Test");
    expect(counterUpdates).toEqual([{ comment_num: { increment: 1 } }]);
    expect(mailCalls.new).toHaveLength(1);
    expect(mailCalls.pending).toHaveLength(0);
  });

  test("人工审核开启 → 待审核:计数不加、通知站主待审", async () => {
    commentSettings = { __moderation: "true" };
    const r = await call(validBody());
    expect(r.needModeration).toBe(true);
    expect(String(r.message)).toContain("请等待审核");
    expect(created[0]!.status).toBe(0);
    expect(counterUpdates).toHaveLength(0);
    expect(mailCalls.pending).toHaveLength(1);
    expect(mailCalls.new).toHaveLength(0);
  });

  test("百度审核开启:结论合并送审;待审结论 fail-closed", async () => {
    auditEnabled = true;
    auditConclusion = 4;
    const r = await call(validBody());
    expect(auditTexts[0]).toContain("昵称：小明");
    expect(auditTexts[0]).toContain("正常评论");
    expect(created[0]!.status).toBe(0);
    expect(String(r.message)).toContain("请等待审核");

    auditConclusion = 2;
    mailCalls.pending.length = 0;
    const r2 = await call(validBody());
    expect(String(r2.message)).toContain("已被标记为垃圾");
  });

  test("回复有邮箱的父评论 → 通知被回复人;无邮箱不通知", async () => {
    parentRow = { coid: 10, parent_id: null };
    sharedFake.on("comments", "findUnique", async ({ where }: { where: { coid: number } }) => {
      if (where.coid === 10) return { name: "父君", mail: "p@x.com", content: "父评论", parent_id: null };
      return null;
    });
    await call({ ...validBody(), parent_id: 10 });
    expect(mailCalls.reply).toHaveLength(1);
    expect(mailCalls.new).toHaveLength(0);

    mailCalls.reply.length = 0;
    sharedFake.on("comments", "findUnique", async ({ where }: { where: { coid: number } }) => {
      if (where.coid === 10) return { name: "父君", mail: null, content: "父评论", parent_id: null };
      return null;
    });
    await call({ ...validBody(), parent_id: 10 });
    expect(mailCalls.reply).toHaveLength(0);
  });

  test("已登录用户免验证码", async () => {
    const { loginSessionCookie } = await import("#test/helpers/auth-fakes");
    const cookie = await loginSessionCookie();
    setCaptchaAccept(false);
    const r = await call(validBody(), { cookie: `${cookie}; ${CSRF_COOKIE}` });
    expect(r.code).toBe(200);
  });

  test("写库异常 → 500", async () => {
    sharedFake.on("comments", "create", async () => {
      throw new Error("db down");
    });
    await expect(call(validBody())).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("comments", "create", async ({ data }: { data: Record<string, unknown> }) => {
      created.push({ ...data });
      return { coid: 777, ...data };
    });
  });
});
