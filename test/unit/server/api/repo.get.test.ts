/**
 * /api/repo 仓库卡片代理：参数白名单、归一化、服务端缓存命中、回源失败降级。
 * safe-fetch 与 redis 打桩隔离外联。
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

const upstreamCalls: string[] = [];
let upstreamMode: "ok" | "fail" = "ok";

mock.module("#server/utils/redis", () => ({ redis: null }));

beforeEach(() => {
  upstreamCalls.length = 0;
  upstreamMode = "ok";
});

const handler = (await import("#server/api/repo.get")).default;

const UPSTREAM = {
  full_name: "a/b",
  description: "desc",
  language: "TypeScript",
  stargazers_count: 12,
  forks_count: 3,
  // 上游多余字段不应透传
  network_count: 99,
};

// fetchPublicUrl 打桩：ok 时把 UPSTREAM 喂给 process 回调（endpoint 侧 json() 在此）
mock.module("#server/utils/safe-fetch", () => ({
  fetchPublicUrl: async <T>(url: string, process: (r: { ok: boolean; json: () => Promise<unknown> }) => Promise<T>): Promise<T> => {
    upstreamCalls.push(url);
    if (upstreamMode === "fail") throw new Error("upstream down");
    return process({ ok: true, json: async () => UPSTREAM });
  },
}));

function repoEvent(query: string) {
  const url = `/api/repo${query}`;
  return {
    method: "GET",
    context: { params: {}, clientAddress: "127.0.0.1" },
    path: url,
    node: {
      req: { method: "GET", url, headers: {}, socket: { remoteAddress: "127.0.0.1" } },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never;
}

describe("GET /api/repo", () => {
  test("参数非法（缺 p / owner 带路径字符）→ 400", async () => {
    await expect(handler(repoEvent(""))).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler(repoEvent("?p=github&owner=a/b&repo=c"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler(repoEvent("?p=gitlab&owner=a&repo=b"))).rejects.toMatchObject({ statusCode: 400 });
    expect(upstreamCalls.length).toBe(0);
  });

  test("首次回源 → 归一化白名单字段,URL 拼接正确", async () => {
    const r = (await handler(repoEvent("?p=github&owner=a&repo=b"))) as unknown as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      platform: "github", owner: "a", repo: "b",
      fullName: "a/b", description: "desc", language: "TypeScript", stars: 12, forks: 3,
    });
    expect(Object.keys(r.data)).not.toContain("network_count");
    expect(upstreamCalls).toEqual(["https://api.github.com/repos/a/b"]);
  });

  test("24h 内重复请求命中服务端缓存,不再回源", async () => {
    await handler(repoEvent("?p=gitee&owner=x&repo=y"));
    const r2 = (await handler(repoEvent("?p=gitee&owner=x&repo=y"))) as { cached?: boolean };
    expect(r2.cached).toBe(true);
    expect(upstreamCalls.length).toBe(1);
  });

  test("回源失败且无缓存 → 502", async () => {
    upstreamMode = "fail";
    await expect(handler(repoEvent("?p=github&owner=dead&repo=repo"))).rejects.toMatchObject({ statusCode: 502 });
  });
});
