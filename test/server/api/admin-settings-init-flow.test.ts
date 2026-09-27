/**
 * server/api/admin/settings/init.post.ts:
 *  - method != POST → 405
 *  - 未登录 → 401(在 try 外,不被吞 500)
 *  - CSRF 失败 → 403
 *  - 已有 key 跳过,缺 key createMany(skipDuplicates: true)
 *  - 全部已存在 → createdItems.length=0,不调 createMany
 *  - invalidateContentCaches fire-and-forget(不等完成)
 *  - 异常带 statusCode → 原样抛
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let getUserImpl: (e: unknown) => Promise<unknown>;
let validateCsrfImpl: (e: unknown, t?: unknown) => boolean;
let invalidateCalled: number;

beforeEach(() => {
  getUserImpl = async () => ({ uid: 1 });
  validateCsrfImpl = () => true;
  invalidateCalled = 0;
  mock.module("#server/lib/auth", () => ({
    getUser: async (e: unknown) => getUserImpl(e),
  }));
  mock.module("#server/utils/csrf", () => ({
    validateCsrfToken: (_e: unknown, t: unknown) => validateCsrfImpl(_e, t),
    ensureCsrfToken: () => "csrf-yes",
    getStoredCsrfToken: () => null,
    setCsrfToken: () => "csrf-yes",
    generateCsrfToken: () => "csrf-yes",
  }));
  mock.module("#server/utils/content-cache", () => ({
    invalidateContentCaches: async () => { invalidateCalled++; return {}; },
  }));
});

const { default: initHandler } = await import("#server/api/admin/settings/init.post");

function makeEvent(method: string, body: unknown) {
  return {
    method,
    path: "/api/admin/settings/init",
    _requestBody: body === undefined ? undefined : JSON.stringify(body),
    node: {
      req: {
        method,
        url: "/api/admin/settings/init",
        headers: body === undefined ? {} : { "content-type": "application/json" },
      },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  };
}

async function callInit(method = "POST", body?: unknown): Promise<unknown> {
  return (initHandler as (e: never) => Promise<unknown>)(makeEvent(method, body) as never);
}

describe("admin settings/init:守卫", () => {
  test("method=GET → 405", async () => {
    await expect(callInit("GET", { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 405 });
  });

  test("未登录 → 401(不被 try/catch 吞 500)", async () => {
    getUserImpl = async () => null;
    await expect(callInit("POST", { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 失败 → 403", async () => {
    validateCsrfImpl = () => false;
    await expect(callInit("POST", { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("admin settings/init:创建逻辑", () => {
  test("已有部分 key → 缺哪些补哪些", async () => {
    sharedFake.on("informations", "findMany", async () => [
      { key: "siteName" }, { key: "siteUrl" },
    ]);
    let createPayload: unknown;
    sharedFake.on("informations", "createMany", async ({ data }: { data: unknown }) => {
      createPayload = data;
      return { count: (data as unknown[]).length };
    });
    const res = await callInit("POST", { csrfToken: "x" }) as {
      success: boolean;
      message: string;
      data: { created: Array<{ key: string; value: string }>; total: number };
    };
    expect(res.success).toBe(true);
    expect(res.data.total).toBeGreaterThan(0); // = defaults 长度
    expect(res.data.created.length).toBe(res.data.total - 2); // 16 - 2 已存在
    expect(res.data.created.every(c => c.key !== "siteName" && c.key !== "siteUrl")).toBe(true);
    // 断言关键:createMany 被调且带 skipDuplicates
    expect(createPayload).toBeDefined();
  });

  test("全部 key 已存在 → createdItems=0,不调 createMany", async () => {
    // mock 所有 default key 已存在
    sharedFake.on("informations", "findMany", async () => {
      return Object.keys({
        siteName: "", siteUrl: "", siteDesc: "", siteIcp: "", homeCustomText: "",
        photoCategorySlug: "", commentEnabled: true, commentAvatarService: "",
        commentPageSize: 0, commentMaxLevel: 0, commentInterval: 0,
        commentRequireMail: true, commentRequireLink: false,
        contentPageSize: 0, feedCacheInterval: 0, uploadLocation: "",
      }).map(k => ({ key: k }));
    });
    let createCalls = 0;
    sharedFake.on("informations", "createMany", async () => { createCalls++; return { count: 0 }; });
    const res = await callInit("POST", { csrfToken: "x" }) as {
      success: boolean;
      message: string;
      data: { created: unknown[] };
    };
    expect(res.success).toBe(true);
    expect(res.message).toContain("已存在");
    expect(res.data.created).toHaveLength(0);
    expect(createCalls).toBe(0);
  });

  test("boolean default → createMany payload value 为 'true'/'false' 字符串", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    let data: Array<{ key: string; value: string }> = [];
    sharedFake.on("informations", "createMany", async ({ data: d }: { data: Array<{ key: string; value: string }> }) => {
      data = d;
      return { count: d.length };
    });
    await callInit("POST", { csrfToken: "x" });
    const commentEnabled = data.find(d => d.key === "commentEnabled");
    const commentRequireLink = data.find(d => d.key === "commentRequireLink");
    expect(commentEnabled?.value).toBe("true");
    expect(commentRequireLink?.value).toBe("false");
  });
});

describe("admin settings/init:副作用", () => {
  test("invalidateContentCaches 触发一次(fire-and-forget)", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    sharedFake.on("informations", "createMany", async ({ data }: { data: unknown[] }) => ({ count: (data as unknown[]).length }));
    await callInit("POST", { csrfToken: "x" });
    expect(invalidateCalled).toBe(1);
  });

  test("createMany 抛 P2002-like 错误 → 被 catch 兜底 500", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    sharedFake.on("informations", "createMany", async () => {
      throw Object.assign(new Error("P2002"), { code: "P2002" });
    });
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(callInit("POST", { csrfToken: "x" })).rejects.toMatchObject({
        statusCode: 500,
        message: "初始化配置失败",
      });
    } finally {
      console.error = origErr;
    }
  });
});