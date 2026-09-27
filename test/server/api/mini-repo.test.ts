/**
 * server/api/mini/repo.get.ts:
 *  - 缺参数 / 非法 platform → 400
 *  - 合法 github/gitee → 调对应 API,归一化字段,返回 MiniRepo
 *  - 上游错误 → 502 "获取仓库信息失败"
 *  - 关键:redirect:"error"(防 SSRF 重定向到其他主机)
 */
import "#test/helpers/nitro-globals";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

interface FetchCall { url: string; opts: { headers?: Record<string, string>; redirect?: string } }
const fetchCalls: FetchCall[] = [];

beforeEach(() => {
  fetchCalls.length = 0;
  // 默认 mock 成功 GitHub 响应
  globalThis.$fetch = (async (url: string, opts: { headers?: Record<string, string>; redirect?: string } = {}) => {
    fetchCalls.push({ url, opts });
    return {
      full_name: "owner/repo",
      name: "repo",
      description: "desc",
      language: "TypeScript",
      stargazers_count: 100,
      forks_count: 10,
      private: false,
    };
  }) as typeof globalThis.$fetch;
});

afterEach(() => {
  fetchCalls.length = 0;
});

const { default: repoHandler } = await import("#server/api/mini/repo.get");

function callRepo(q: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(q).toString();
  return (repoHandler as (e: never) => Promise<unknown>)({
    method: "GET",
    path: `/api/mini/repo?${qs}`,
    url: `/api/mini/repo?${qs}`,
    node: {
      req: { method: "GET", url: `/api/mini/repo?${qs}`, headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
    query: q,
    context: { params: {}, query: q },
  } as never);
}

describe("mini/repo:get 参数校验", () => {
  test("缺 platform → 400", async () => {
    await expect(callRepo({ owner: "o", repo: "r" })).rejects.toMatchObject({
      statusCode: 400,
      message: "缺少或非法的仓库参数",
    });
  });

  test("非法 platform → 400", async () => {
    await expect(callRepo({ platform: "bitbucket", owner: "o", repo: "r" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test("缺 owner → 400", async () => {
    await expect(callRepo({ platform: "github", repo: "r" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("缺 repo → 400", async () => {
    await expect(callRepo({ platform: "github", owner: "o" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("platform=数组(getQuery 重复参数场景)→ 走 typeof !== 'string' 分支 → 400", async () => {
    // 模拟重复参数:platform 是数组
    const event = {
      method: "GET",
      node: { req: { method: "GET", url: "/x", headers: {} }, res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) } },
      query: { platform: ["github", "gitee"], owner: "o", repo: "r" },
      context: { query: { platform: ["github", "gitee"], owner: "o", repo: "r" } },
    };
    await expect((repoHandler as (e: never) => Promise<unknown>)(event as never)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("mini/repo:get 代理与归一化", () => {
  test("platform=github → 调 api.github.com,带 User-Agent,redirect='error'(防 SSRF)", async () => {
    const res = await callRepo({ platform: "github", owner: "facebook", repo: "react" }) as { success: boolean; data: { fullName: string; stars: number; forks: number; isPrivate: boolean; url: string } };
    expect(res.success).toBe(true);
    expect(res.data.fullName).toBe("owner/repo");
    expect(res.data.stars).toBe(100);
    expect(res.data.forks).toBe(10);
    expect(res.data.isPrivate).toBe(false);
    expect(res.data.url).toBe("https://github.com/facebook/react");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://api.github.com/repos/facebook/react");
    expect(fetchCalls[0]!.opts.redirect).toBe("error");
    expect(fetchCalls[0]!.opts.headers?.["User-Agent"]).toBeDefined();
    expect(fetchCalls[0]!.opts.headers?.Accept).toBe("application/json");
  });

  test("platform=gitee → 调 gitee.com/api/v5", async () => {
    const res = await callRepo({ platform: "gitee", owner: "owner", repo: "repo" }) as { data: { url: string } };
    expect(res.data.url).toBe("https://gitee.com/owner/repo");
    expect(fetchCalls[0]!.url).toBe("https://gitee.com/api/v5/repos/owner/repo");
  });

  test("字段兜底:缺 full_name 用 name;name 也无 → 拼 ${owner}/${repo}", async () => {
    globalThis.$fetch = (async () => ({
      full_name: "",
      name: "",
      description: null,
      language: null,
      stargazers_count: undefined,
      forks_count: undefined,
      private: undefined,
    })) as typeof globalThis.$fetch;
    const res = await callRepo({ platform: "github", owner: "o", repo: "r" }) as { data: { fullName: string; description: string; language: string; stars: number; forks: number; isPrivate: boolean } };
    expect(res.data.fullName).toBe("o/r");
    expect(res.data.description).toBe("");
    expect(res.data.language).toBe("");
    expect(res.data.stars).toBe(0);
    expect(res.data.forks).toBe(0);
    expect(res.data.isPrivate).toBe(false);
  });

  test("owner/repo 自动 trim", async () => {
    await callRepo({ platform: "github", owner: "  o  ", repo: "  r  " });
    expect(fetchCalls[0]!.url).toBe("https://api.github.com/repos/o/r");
  });
});

describe("mini/repo:get 上游错误", () => {
  test("上游 fetch 抛错 → 502 '获取仓库信息失败'", async () => {
    globalThis.$fetch = (async () => { throw new Error("upstream 500"); }) as typeof globalThis.$fetch;
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(callRepo({ platform: "github", owner: "o", repo: "r" })).rejects.toMatchObject({
        statusCode: 502,
        message: "获取仓库信息失败",
      });
    } finally {
      console.error = origErr;
    }
  });
});