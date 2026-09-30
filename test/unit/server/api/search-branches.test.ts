import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// redis 假件:可控 cacheEnabled 路径(searchCacheEnabled=true 时走缓存读写)
const cacheStore = new Map<string, string>();
let redisEnabled = true;
mock.module("#server/utils/redis", () => ({
  redis: redisEnabled
    ? {
        get: async (k: string) => cacheStore.get(k) ?? null,
        setex: async (k: string, _t: number, v: string) => {
          if (cacheStore.has("__throw")) throw new Error("redis write failed");
          cacheStore.set(k, v);
          return "OK";
        },
      }
    : null,
}));

let settingsMap = new Map<string, string>();
sharedFake.on("informations", "findMany", async ({ where }: { where?: { key?: { in: string[] } } }) => {
  const keys = where?.key?.in ?? [];
  return keys.filter(k => settingsMap.has(k)).map(k => ({ key: k, value: settingsMap.get(k)! }));
});
sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) =>
  settingsMap.has(where.key) ? { value: settingsMap.get(where.key)! } : null);
sharedFake.on("contents", "findFirst", async () => null);
sharedFake.on("contents", "findMany", async () => []);
sharedFake.on("links", "findMany", async () => []);
sharedFake.on("subscribes", "findMany", async () => []);

// 评论搜索结果:覆盖「有分类」「无分类回落 uncategorized」「留言板」三分支
let commentRows: Array<Record<string, unknown>> = [];
sharedFake.on("comments", "findMany", async () => commentRows);

let postRows: Array<Record<string, unknown>> = [];
sharedFake.on("subscribeposts", "findMany", async () => postRows);

const handler = (await import("#server/api/search.get")).default;

function call(query: string) {
  return handler(makeAuthEvent({ method: "GET", peer: "10.11.1.1", url: `/api/search${query}`, headers: { host: "imqi1.com" } }).event) as unknown as Promise<{
    data: { results: Array<Record<string, unknown>>; total: number; type: string };
  }>;
}

beforeEach(() => {
  cacheStore.clear();
  redisEnabled = true;
  settingsMap = new Map();
  commentRows = [];
  postRows = [];
});

describe("search/评论分支(type=comment)", () => {
  test("有分类的文章评论 → /content/<分类>/<slug>#comment", async () => {
    commentRows = [
      {
        coid: 1, name: "甲", mail: null, content: "评论内容", create_time: new Date(),
        content_ref: { cid: 10, title: "文章", slug: "post-a", status: 1, contentrelations: [{ metas: { slug: "note" } }] },
      },
    ];
    const r = await call("?q=%E8%AF%84%E8%AE%BA&type=comment");
    expect(r.data.results[0]!.articleUrl).toBe("/content/note/post-a#comment-1");
  });

  test("无任何分类 → 回落 uncategorized;有分类但 slug 缺失 → null", async () => {
    commentRows = [
      { coid: 1, name: "甲", mail: null, content: "x", create_time: new Date(), content_ref: { cid: 10, title: "t", slug: "s", status: 1, contentrelations: [] } },
      { coid: 2, name: "乙", mail: null, content: "x", create_time: new Date(), content_ref: { cid: 11, title: "t", slug: "s2", status: 1, contentrelations: [{ metas: null }] } },
    ];
    const r = await call("?q=x&type=comment");
    expect(r.data.results[0]!.articleUrl).toBe("/content/uncategorized/s#comment-1");
    expect(r.data.results[1]!.articleUrl).toBeNull();
  });

  test("留言板评论(cid 命中 messageContentId)→ /messages#comment", async () => {
    settingsMap.set("messageContentId", "10");
    commentRows = [
      { coid: 5, name: "甲", mail: null, content: "留言", create_time: new Date(), content_ref: { cid: 10, title: "留言板", slug: "messages", status: 1, contentrelations: [] } },
    ];
    const r = await call("?q=%E7%95%99%E8%A8%80&type=comment");
    expect(r.data.results[0]!.articleUrl).toBe("/messages#comment-5");
  });
});

describe("search/订阅文章分支(type=subscribepost)", () => {
  test("返回订阅源名称并净化外链", async () => {
    postRows = [
      {
        id: 1, subscribeId: 2, title: "订阅文", link: "javascript:alert(1)",
        description: "d", author: "a", pubDate: new Date(),
        subscribe: { name: "某博客", avatar: "/a.png" },
      },
    ];
    const r = await call("?q=%E8%AE%A2%E9%98%85&type=subscribepost");
    expect(r.data.results[0]).toMatchObject({ subscribeName: "某博客", link: "" });
  });
});

describe("search/缓存分支", () => {
  test("cacheEnabled=true:首次回源并写缓存,二次命中缓存", async () => {
    settingsMap.set("searchCacheEnabled", "true");
    settingsMap.set("searchCacheExpire", "300");
    // 实现仅在「有结果」时写缓存
    commentRows = [{ coid: 1, name: "甲", mail: null, content: "c", create_time: new Date(), content_ref: { cid: 10, title: "t", slug: "s", status: 1, contentrelations: [] } }];

    const first = await call("?q=cachetest&type=comment");
    expect(first.data.total).toBe(1);
    expect(cacheStore.size).toBe(1);

    // 预置缓存后应直接返回(不再依赖 DB)
    cacheStore.set("search:cachetest:comment", JSON.stringify({ results: [{ hit: true }], total: 1, query: "cachetest", type: "comment" }));
    const second = (await call("?q=cachetest&type=comment")) as unknown as { message: string; data: { results: unknown[] } };
    expect(second.data.results[0]).toEqual({ hit: true });
    expect(second.message).toContain("缓存");
  });

  test("写缓存抛错不影响返回(缓存是 best-effort)", async () => {
    settingsMap.set("searchCacheEnabled", "true");
    commentRows = [{ coid: 1, name: "甲", mail: null, content: "c", create_time: new Date(), content_ref: { cid: 10, title: "t", slug: "s", status: 1, contentrelations: [] } }];
    cacheStore.set("__throw", "1"); // 让 setex 抛错的开关
    const r = await call("?q=throwcache&type=comment");
    expect(r.data.total).toBe(1);
  });
});
