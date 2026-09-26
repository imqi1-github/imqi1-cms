import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== 安全外联:返回可控的"对方页面 HTML" =====
let backlinkHtml: string | null = null;
let fetchError: unknown = null;
mock.module("#server/utils/safe-fetch", () => ({
  fetchPublicUrl: async (_url: string, cb: (res: { ok: boolean; status: number; text: () => Promise<string> }) => Promise<unknown>) => {
    if (fetchError) throw fetchError;
    return cb({ ok: true, status: 200, text: async () => backlinkHtml ?? "" });
  },
}));

// ===== 邮件通知:只记录调用 =====
const mailCalls: Record<string, unknown[][]> = { application: [], modification: [] };
mock.module("#server/utils/mail", () => ({
  notifyFriendLinkApplication: (...a: unknown[]) => mailCalls.application.push(a),
  notifyFriendLinkModification: (...a: unknown[]) => mailCalls.modification.push(a),
}));

// ===== prisma 假件 =====
let settings: Record<string, string> = {};
const createdLinks: Array<Record<string, unknown>> = [];
let originalLink: Record<string, unknown> | null = null;

sharedFake.on("informations", "findMany", async ({ where }: { where: { key: { in: string[] } } }) =>
  where.key.in.filter(k => settings[k] !== undefined).map(k => ({ key: k, value: settings[k] })));
sharedFake.on("links", "create", async ({ data }: { data: Record<string, unknown> }) => {
  createdLinks.push({ ...data });
  return { id: 900, ...data };
});
sharedFake.on("links", "findUnique", async ({ where }: { where: { id: number } }) =>
  originalLink && originalLink.id === where.id ? { ...originalLink } : null);

const postLinkHandler = (await import("#server/api/links.post")).default;
const patchLinkHandler = (await import("#server/api/links/patch")).default;

function call(handler: (e: never) => unknown, body: unknown, peer: string, csrf: string | null = CSRF_TOKEN) {
  const payload = body !== null && typeof body === "object" && !Array.isArray(body) && csrf !== null ? { ...(body as Record<string, unknown>), csrfToken: csrf } : body;
  const { event } = makeAuthEvent({ method: "POST", peer, body: payload, cookie: CSRF_COOKIE, url: "/api/links" });
  return handler(event as never) as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  settings = {};
  createdLinks.length = 0;
  originalLink = { id: 5, name: "老站", link: "https://old.com", desc: null, avatar: null };
  backlinkHtml = null;
  fetchError = null;
  mailCalls.application.length = 0;
  mailCalls.modification.length = 0;
});

describe("links.post(友链申请)", () => {
  test("请求体非对象(null/数组) → 400", async () => {
    await expect(call(postLinkHandler, null, "10.8.0.1", null)).rejects.toMatchObject({ statusCode: 400 });
    const { event } = makeAuthEvent({ method: "POST", peer: "10.8.0.2", body: ["x"], cookie: CSRF_COOKIE, url: "/api/links" });
    await expect(postLinkHandler(event as never)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 不匹配 → 403;缺必填 name/link → 400", async () => {
    await expect(call(postLinkHandler, { name: "甲", link: "https://a.com" }, "10.8.0.3", "bad")).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(postLinkHandler, { name: "甲" }, "10.8.0.4")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(postLinkHandler, { link: "https://a.com" }, "10.8.0.5")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("可选字段类型不对 → 400(而非 500)", async () => {
    await expect(call(postLinkHandler, { name: "甲", link: "https://a.com", desc: 123 }, "10.8.0.6")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(postLinkHandler, { name: "甲", link: "https://a.com", avatar: {} }, "10.8.0.7")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(postLinkHandler, { name: "甲", link: "https://a.com", blogLinkUrl: 42 }, "10.8.0.8")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("javascript: 协议与坏 blogLinkUrl → 400(防存储型 XSS)", async () => {
    await expect(call(postLinkHandler, { name: "甲", link: "javascript:alert(1)" }, "10.8.0.9")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(postLinkHandler, { name: "甲", link: "https://a.com", blogLinkUrl: "ftp://x.com" }, "10.8.0.10")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(postLinkHandler, { name: "甲", link: "https://a.com", blogLinkUrl: "http://" }, "10.8.0.11")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("无协议链接自动补全 https:// 后入库", async () => {
    const r = await call(postLinkHandler, { name: "  乙  ", link: "example.com", desc: "  ", avatar: "" }, "10.8.0.12");
    expect(r.code).toBe(200);
    expect(createdLinks[0]!.link).toBe("https://example.com");
    expect(createdLinks[0]!.name).toBe("乙");
    expect(createdLinks[0]!.desc).toBeNull();
    expect(createdLinks[0]!.enabled).toBe(false);
    expect(mailCalls.application).toHaveLength(1);
  });

  test("自动审核开 + 检测到回链 → 直接启用;未检测到 → needRetry 且不建行", async () => {
    settings = { linkAutoApprove: "true", siteUrl: "https://blog.example.com" };

    backlinkHtml = '<a href="https://BLOG.example.com/post">本站</a>';
    const ok = await call(postLinkHandler, { name: "甲", link: "https://a.com", blogLinkUrl: "https://a.com/" }, "10.8.0.13");
    expect(ok.message).toContain("自动通过");
    expect(createdLinks[0]!.enabled).toBe(true);

    createdLinks.length = 0;
    backlinkHtml = "<p>没有回链</p>";
    const retry = await call(postLinkHandler, { name: "乙", link: "https://b.com", blogLinkUrl: "https://b.com/" }, "10.8.0.14");
    expect(retry.code).toBe(400);
    expect(retry.needRetry).toBe(true);
    expect(createdLinks).toHaveLength(0);
  });

  test("forceSubmit 跳过检测直接进待审核", async () => {
    settings = { linkAutoApprove: "true", siteUrl: "https://blog.example.com" };
    const r = await call(postLinkHandler, { name: "甲", link: "https://a.com", blogLinkUrl: "https://a.com/", forceSubmit: true }, "10.8.0.15");
    expect(createdLinks[0]!.enabled).toBe(false);
    expect(String(r.message)).toContain("等待管理员审核");
  });
});

describe("links/patch(友链修改申请)", () => {
  const modBody = () => ({ name: "新名", link: "https://new.com", originalLinkId: 5 });

  test("CSRF/必填/originalLinkId 校验", async () => {
    await expect(call(patchLinkHandler, modBody(), "10.8.1.1", "bad")).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(patchLinkHandler, { link: "https://x.com", originalLinkId: 5 }, "10.8.1.2")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(patchLinkHandler, { ...modBody(), originalLinkId: 0 }, "10.8.1.3")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(patchLinkHandler, { ...modBody(), originalLinkId: "abc" }, "10.8.1.4")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("原友链不存在 → 404", async () => {
    originalLink = null;
    await expect(call(patchLinkHandler, modBody(), "10.8.1.5")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功:建 pending 修改行(默认禁用)并通知站主", async () => {
    const r = await call(patchLinkHandler, { ...modBody(), desc: "", avatar: " /a.png " }, "10.8.1.6");
    expect(r.code).toBe(200);
    expect(createdLinks[0]).toMatchObject({
      name: "新名",
      link: "https://new.com",
      enabled: false,
      isModification: true,
      originalLinkId: 5,
      modificationStatus: "pending",
    });
    expect(createdLinks[0]!.desc).toBeNull();
    expect(createdLinks[0]!.avatar).toBe("/a.png");
    expect(mailCalls.modification).toHaveLength(1);
  });
});
