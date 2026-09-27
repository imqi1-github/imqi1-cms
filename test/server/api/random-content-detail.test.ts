/**
 * server/api/random-content.get.ts:
 *  - count=0 或 findMany=[] → 静默 {success:false, data:null}(不抛 404)
 *  - 正常 → 响应字段白名单:{cid,title,slug,desc,covers,travelCount,category}
 *  - 异常 → 500,不外泄 error.message / 堆栈
 *  - 关键:Prisma select 白名单由 Prisma 层保证,handler 内响应也仅取这些字段;此处断言响应形状
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const { default: randomContentHandler } = await import("#server/api/random-content.get");

beforeEach(() => {
  // 默认:5 篇可随机文章
  sharedFake.on("contents", "count", async () => 5);
  sharedFake.on("contents", "findMany", async () => [
    {
      cid: 42,
      title: "Hello",
      slug: "hello",
      desc: "desc-x",
      covers: "[]",
      contentrelations: [
        { cid: 42, mid: 7, metas: { mid: 7, name: "技术", slug: "tech" } },
      ],
      travels: [{ travel_id: 1 }, { travel_id: 2 }],
    },
  ]);
});

function callHandler(): Promise<unknown> {
  const event = {
    node: {
      req: { headers: {} as Record<string, string> },
      res: {
        setHeader() {},
        getHeader: () => undefined,
        getHeaders: () => ({}),
      },
    },
  };
  return (randomContentHandler as (e: never) => Promise<unknown>)(event as never);
}

describe("random-content.get.ts 公开接口白名单", () => {
  test("count=0 → {success:false, data:null}(静默,不抛 404)", async () => {
    sharedFake.on("contents", "count", async () => 0);
    const res = await callHandler() as { success: boolean; data: unknown };
    expect(res.success).toBe(false);
    expect(res.data).toBeNull();
  });

  test("findMany 返 [] 但 count>0(skip 越界)→ 静默 false", async () => {
    sharedFake.on("contents", "count", async () => 3);
    sharedFake.on("contents", "findMany", async () => []);
    const res = await callHandler() as { success: boolean; data: unknown };
    expect(res.success).toBe(false);
    expect(res.data).toBeNull();
  });

  test("正常返回:响应字段精确白名单(无 password/mail/authCode/content 等)", async () => {
    const res = await callHandler() as { success: boolean; data: Record<string, unknown> };
    expect(res.success).toBe(true);
    const keys = Object.keys(res.data).sort();
    // 必出字段(cid/title/slug/desc/covers/travelCount/category)
    expect(keys).toEqual(["category", "cid", "covers", "desc", "slug", "title", "travelCount"]);
    // 必不出字段(隐私 + 内部审核)
    for (const banned of ["password", "mail", "authCode", "content", "content_html", "auth_code", "ip", "views"]) {
      expect(banned in res.data).toBe(false);
    }
  });

  test("category = {name, slug} 从 contentrelations[0].metas 取", async () => {
    const res = await callHandler() as { data: { category: { name: string; slug: string } } };
    expect(res.data.category).toEqual({ name: "技术", slug: "tech" });
  });

  test("无分类(contentrelations 空)→ category=null,不抛错", async () => {
    sharedFake.on("contents", "findMany", async () => [
      {
        cid: 1, title: "t", slug: "s", desc: "d", covers: "[]",
        contentrelations: [],
        travels: [],
      },
    ]);
    const res = await callHandler() as { data: { category: unknown } };
    expect(res.data.category).toBeNull();
  });

  test("travelCount = travels.length", async () => {
    sharedFake.on("contents", "findMany", async () => [
      {
        cid: 1, title: "t", slug: "s", desc: "d", covers: "[]",
        contentrelations: [],
        travels: [{ travel_id: 1 }, { travel_id: 2 }, { travel_id: 3 }],
      },
    ]);
    const res = await callHandler() as { data: { travelCount: number } };
    expect(res.data.travelCount).toBe(3);
  });

  test("covers 走 parseCovers(covers 字段)", async () => {
    sharedFake.on("contents", "findMany", async () => [
      {
        cid: 1, title: "t", slug: "s", desc: "d", covers: '[{"src":"a.jpg"}]',
        contentrelations: [],
        travels: [],
      },
    ]);
    const res = await callHandler() as { data: { covers: unknown } };
    // covers 解析后应是数组或 null(由 parseCovers 决定);断言类型非字符串
    expect(typeof res.data.covers).not.toBe("string");
  });

  test("异常 → 500,message 不含原始堆栈/error.message", async () => {
    sharedFake.on("contents", "count", async () => {
      throw new Error("DB connection reset — internal stack trace 0x1234abcd");
    });
    let caught: unknown;
    try {
      await callHandler();
    } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    const err = caught as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe("生成随机文章失败");
    // 关键不变式:不外泄内部细节
    expect(err.message).not.toContain("DB connection");
    expect(err.message).not.toContain("0x1234");
  });
});