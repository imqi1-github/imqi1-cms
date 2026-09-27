/**
 * server/api/related-contents/[cid].get.ts:
 *  - cid 校验:非整数/≤0 → 400 '文章ID不能为空'
 *  - limit clamp: 1..100, 默认 3(非字符串/空 → 3)
 *  - 当前文章不存在 → {success:true, data:[]}(静默空,不抛 404)
 *  - 当前文章无 tag → {success:true, data:[]}
 *  - 候选池 = limit*4 或 20(取大),按共享 tag 数 desc 排序,再按时间 desc
 *  - 排除当前文章 + slug 非空 + type:0, status:1
 *  - 分类/标签按 metas.type 分离
 *  - 异常:带 statusCode 原样抛 / P2025 → 404 / 其他 → 500
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const { default: relatedHandler } = await import("~/../server/api/related-contents/[cid].get");

function makeEvent(params: Record<string, string>, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  const path = `/api/related-contents/${params.cid ?? ""}`;
  // h3 getQuery 内部用 event.path(非 url)做解析 → 把 query 拼到 path
  const fullPath = qs ? `${path}?${qs}` : path;
  return {
    method: "GET",
    path: fullPath,
    url: fullPath,
    context: { params, query },
    query,
    node: {
      req: { method: "GET", url: fullPath, headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  };
}

function call(params: Record<string, string>, query: Record<string, string> = {}): Promise<unknown> {
  return (relatedHandler as (e: never) => Promise<unknown>)(makeEvent(params, query) as never);
}

beforeEach(() => {
  sharedFake.on("contents", "findUnique", async () => ({
    cid: 1,
    contentrelations: [{ mid: 10 }, { mid: 20 }],
  }));
  sharedFake.on("contents", "findMany", async () => []);
});

describe("related-contents:cid/limit 校验", () => {
  test("cid 缺 → 400", async () => {
    await expect(call({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 非整数 → 400", async () => {
    await expect(call({ cid: "abc" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 浮点 → 400", async () => {
    await expect(call({ cid: "1.5" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid ≤ 0 → 400", async () => {
    await expect(call({ cid: "0" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ cid: "-1" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("limit 默认 3(未传)", async () => {
    let takeSeen = 0;
    sharedFake.on("contents", "findMany", async ({ take }: { take: number }) => {
      takeSeen = take;
      return [];
    });
    await call({ cid: "1" });
    // candidateLimit = max(3*4, 20) = 20
    expect(takeSeen).toBe(20);
  });

  test("limit=10 → candidateLimit=40,clamp 到 PUBLIC_LIMIT_MAX(=100)", async () => {
    let takeSeen = 0;
    sharedFake.on("contents", "findMany", async ({ take }: { take: number }) => {
      takeSeen = take;
      return [];
    });
    await call({ cid: "1" }, { limit: "10" });
    expect(takeSeen).toBe(40);
  });

  test("limit=500 → clamp 到 PUBLIC_LIMIT_MAX", async () => {
    let takeSeen = 0;
    sharedFake.on("contents", "findMany", async ({ take }: { take: number }) => {
      takeSeen = take;
      return [];
    });
    await call({ cid: "1" }, { limit: "500" });
    // min(100, max(1, 500)) = 100;candidate = max(100*4=400 → clamp 100, 20) = 100
    expect(takeSeen).toBe(100);
  });

  test("limit 非数字字符串 → 默认 3", async () => {
    let takeSeen = 0;
    sharedFake.on("contents", "findMany", async ({ take }: { take: number }) => {
      takeSeen = take;
      return [];
    });
    await call({ cid: "1" }, { limit: "abc" });
    expect(takeSeen).toBe(20);
  });
});

describe("related-contents:无结果分支", () => {
  test("当前文章不存在 → {success:true, data:[]}(静默空)", async () => {
    sharedFake.on("contents", "findUnique", async () => null);
    const res = await call({ cid: "99" }) as { success: boolean; data: unknown[] };
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });

  test("当前文章无 tag → {success:true, data:[]}", async () => {
    sharedFake.on("contents", "findUnique", async () => ({
      cid: 1,
      contentrelations: [], // 无 tag 关联
    }));
    const res = await call({ cid: "1" }) as { success: boolean; data: unknown[] };
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });
});

describe("related-contents:排序 + 分类/标签分离", () => {
  test("按共享 tag 数 desc,再按时间 desc 排序", async () => {
    sharedFake.on("contents", "findUnique", async () => ({
      cid: 1,
      contentrelations: [{ mid: 10 }, { mid: 20 }, { mid: 30 }],
    }));
    sharedFake.on("contents", "findMany", async () => [
      // 共享 1 个 tag(10)
      {
        cid: 2, title: "A", slug: "a", desc: null, covers: null,
        create_time: new Date("2026-03-20T00:00:00Z"), comment_num: 0,
        contentrelations: [{ cid: 2, mid: 10, metas: { mid: 10, name: "t10", slug: "t10", type: "tag" } }],
      },
      // 共享 3 个 tag(10, 20, 30)
      {
        cid: 3, title: "B", slug: "b", desc: null, covers: null,
        create_time: new Date("2026-01-01T00:00:00Z"), comment_num: 0,
        contentrelations: [
          { cid: 3, mid: 10, metas: { mid: 10, name: "t10", slug: "t10", type: "tag" } },
          { cid: 3, mid: 20, metas: { mid: 20, name: "t20", slug: "t20", type: "tag" } },
          { cid: 3, mid: 30, metas: { mid: 30, name: "t30", slug: "t30", type: "tag" } },
        ],
      },
    ]);
    const res = await call({ cid: "1" }) as { data: Array<{ cid: number }> };
    // 共享 3 个 tag 的 B 排第一(相关性更高)
    expect(res.data[0]!.cid).toBe(3);
    expect(res.data[1]!.cid).toBe(2);
  });

  test("分类与标签按 metas.type 分离到不同数组", async () => {
    sharedFake.on("contents", "findUnique", async () => ({
      cid: 1,
      contentrelations: [{ mid: 10 }],
    }));
    sharedFake.on("contents", "findMany", async () => [
      {
        cid: 2, title: "T", slug: "s", desc: "d", covers: null,
        create_time: new Date("2026-01-01T00:00:00Z"), comment_num: 3,
        contentrelations: [
          { cid: 2, mid: 100, metas: { mid: 100, name: "tech", slug: "tech", type: "category" } },
          { cid: 2, mid: 200, metas: { mid: 200, name: "vue", slug: "vue", type: "tag" } },
        ],
      },
    ]);
    const res = await call({ cid: "1" }) as { data: Array<{ categories: unknown[]; tags: unknown[]; commentsNum: number }> };
    expect(res.data[0]!.categories).toEqual([{ name: "tech", slug: "tech" }]);
    expect(res.data[0]!.tags).toEqual([{ name: "vue", slug: "vue" }]);
    expect(res.data[0]!.commentsNum).toBe(3);
  });

  test("响应字段白名单:无 content 正文/mail/ip 等内部字段", async () => {
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1, contentrelations: [{ mid: 10 }] }));
    sharedFake.on("contents", "findMany", async () => [
      {
        cid: 2, title: "T", slug: "s", desc: "d", covers: "[]",
        create_time: new Date("2026-01-01T00:00:00Z"), comment_num: 0,
        contentrelations: [{ cid: 2, mid: 10, metas: { mid: 10, name: "t", slug: "t", type: "tag" } }],
        // 内部字段不应外泄
        password: "x", auth_code: "y",
      },
    ]);
    const res = await call({ cid: "1" }) as { data: Array<Record<string, unknown>> };
    const item = res.data[0]!;
    const keys = Object.keys(item).sort();
    expect(keys).toEqual(["categories", "cid", "commentsNum", "covers", "created", "desc", "slug", "tags", "title"]);
    expect("password" in item).toBe(false);
    expect("auth_code" in item).toBe(false);
  });
});

describe("related-contents:异常处理", () => {
  test("P2025 → 404 '文章不存在'", async () => {
    sharedFake.on("contents", "findUnique", async () => {
      throw Object.assign(new Error("P2025"), { code: "P2025" });
    });
    await expect(call({ cid: "1" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("异常 → 500 '获取相关文章失败',message 不外泄 error.message", async () => {
    sharedFake.on("contents", "findUnique", async () => {
      throw new Error("DB internal 0xdeadbeef");
    });
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(call({ cid: "1" })).rejects.toMatchObject({
        statusCode: 500,
        message: "获取相关文章失败",
      });
    } finally {
      console.error = origErr;
    }
  });
});