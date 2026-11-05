import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

const handler = (await import("#server/middleware/cache-key")).default as (e: unknown) => unknown;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

// 造最小 event：h3 的 getQuery 取 event.path（带查询串），req.originalUrl 是缓存键来源
function makeEvent(url: string) {
  const event = {
    path: url,
    node: {
      req: { url, originalUrl: url, headers: {} },
      res: {},
    },
  };
  return event as unknown as { node: { req: { originalUrl: string } } };
}

describe("cache-key:查询串归一化", () => {
  test("非生产环境不改写", () => {
    process.env.NODE_ENV = "test";
    const event = makeEvent("/?source=spam");
    handler(event);
    expect(event.node.req.originalUrl).toBe("/?source=spam");
  });

  test("推广参数被剥掉：同一路由共用一份源站缓存", () => {
    process.env.NODE_ENV = "production";
    const event = makeEvent("/?source=spam&utm_medium=ad");
    handler(event);
    expect(event.node.req.originalUrl).toBe("/");
  });

  test("分页参数保留（会改变 SSR 输出）", () => {
    process.env.NODE_ENV = "production";
    const event = makeEvent("/category/note?page=2&utm_source=ad");
    handler(event);
    expect(event.node.req.originalUrl).toBe("/category/note?page=2");
  });

  test("地图视图参数保留", () => {
    process.env.NODE_ENV = "production";
    const event = makeEvent("/map?view=blogs");
    handler(event);
    expect(event.node.req.originalUrl).toBe("/map?view=blogs");
  });

  test("非缓存页面不动（搜索页结果随查询词变）", () => {
    process.env.NODE_ENV = "production";
    const event = makeEvent("/search?q=abc");
    handler(event);
    expect(event.node.req.originalUrl).toBe("/search?q=abc");
  });

  test("没有查询串时不动", () => {
    process.env.NODE_ENV = "production";
    const event = makeEvent("/about");
    handler(event);
    expect(event.node.req.originalUrl).toBe("/about");
  });
});
