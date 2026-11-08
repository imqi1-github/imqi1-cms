import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

const handler = (await import("#server/middleware/cache-canonical")).default as (e: unknown) => unknown;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

/** 造最小 event：需要 res 承载 301 的状态码与 Location 头 */
function makeEvent(url: string, method = "GET") {
  const headers: Record<string, string> = {};
  const event = {
    method,
    path: url,
    node: {
      req: { url, originalUrl: url, headers: {} },
      res: {
        statusCode: 200,
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => headers[name.toLowerCase()],
        end: () => undefined,
        writeHead: () => undefined,
      },
    },
  };
  return { event, headers };
}

describe("cache-canonical:推广参数规范化", () => {
  test("非生产环境不改写", () => {
    process.env.NODE_ENV = "test";
    const { event, headers } = makeEvent("/content/note/1?utm_source=weibo");
    handler(event);
    expect(headers.location).toBeUndefined();
  });

  test("推广参数被剥掉 → 301 到规范 URL（边缘只存一条缓存）", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/content/note/1?utm_source=weibo");
    handler(event);
    expect(event.node.res.statusCode).toBe(301);
    expect(headers.location).toBe("/content/note/1");
  });

  test("会改变 SSR 输出的参数保留（分页）", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/category/note?page=2&utm_source=ad");
    handler(event);
    expect(headers.location).toBe("/category/note?page=2");
  });

  test("地图的 place 保留（标题依赖它，剥掉会串页）", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/map?place=5&utm_source=x");
    handler(event);
    expect(headers.location).toBe("/map?place=5");
  });

  test("已是规范 URL 则不跳转", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/map?view=travels&place=5");
    handler(event);
    expect(headers.location).toBeUndefined();
  });

  test("参数顺序按注册表固定（同一页面只有一条缓存键）", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/map?place=5&view=travels");
    handler(event);
    expect(headers.location).toBe("/map?view=travels&place=5");
  });

  test("无参数不动", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/about");
    handler(event);
    expect(headers.location).toBeUndefined();
  });

  test("搜索页：推广参数剥掉、q 与 type 保留（q 剥掉会串页）", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/search?q=abc&utm_source=x");
    handler(event);
    expect(headers.location).toBe("/search?q=abc");
  });

  test("搜索页的 type 保留（切搜索类别会换结果）", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/search?q=abc&type=comment&utm_source=x");
    handler(event);
    expect(headers.location).toBe("/search?q=abc&type=comment");
  });

  test("非缓存页面不动", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/api/home-data?x=1");
    handler(event);
    expect(headers.location).toBeUndefined();
  });

  test("后台与接口不动", () => {
    process.env.NODE_ENV = "production";
    const { event, headers } = makeEvent("/admin/contents?x=1");
    handler(event);
    expect(headers.location).toBeUndefined();
  });
});
