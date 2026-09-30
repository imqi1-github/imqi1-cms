import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fetchAllAdminContents, fetchAllAdminPages } from "~/utils/admin-picker";

let origFetch: typeof globalThis.$fetch | undefined;
let fetchCalls: Array<{ url: string }> = [];
let responses = new Map<string, unknown>();

beforeEach(() => {
  fetchCalls = [];
  responses = new Map();
  origFetch = (globalThis as { $fetch?: typeof globalThis.$fetch }).$fetch;
  (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
    fetchCalls.push({ url });
    const key = url.split("?")[0]!;
    const value = responses.get(key);
    // value 是函数 → 调它(动态 mock,带 url 参数);否则直接返回(raw response 对象)
    return typeof value === "function" ? (value as (u: string) => unknown)(url) : value;
  }) as typeof globalThis.$fetch;
});

afterEach(() => {
  if (origFetch) {
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = origFetch;
  }
});

describe("fetchAllAdminContents", () => {
  test("totalPages=1 → 只发一次请求,返回首页 data", async () => {
    responses.set("/api/admin/contents", {
      data: [{ cid: 1 }, { cid: 2 }],
      pagination: { totalPages: 1 },
    });
    const items = await fetchAllAdminContents();
    expect(items.map(i => i.cid)).toEqual([1, 2]);
    expect(fetchCalls.filter(c => c.url.startsWith("/api/admin/contents"))).toHaveLength(1);
  });

  test("totalPages=3 → 发 3 次,聚合所有页 data", async () => {
    responses.set("/api/admin/contents", {
      data: [{ cid: 1 }, { cid: 2 }],
      pagination: { totalPages: 3 },
    });
    // 第 2、3 页的 mock(分页参数不同):用 searchParams 区分
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
      fetchCalls.push({ url });
      const u = new URL("http://x" + url);
      const page = u.searchParams.get("page");
      if (page === "1") return { data: [{ cid: 1 }], pagination: { totalPages: 3 } };
      if (page === "2") return { data: [{ cid: 2 }, { cid: 3 }], pagination: { totalPages: 3 } };
      if (page === "3") return { data: [{ cid: 4 }], pagination: { totalPages: 3 } };
      return { data: [], pagination: { totalPages: 3 } };
    }) as typeof globalThis.$fetch;

    const items = await fetchAllAdminContents();
    expect(items.map(i => i.cid)).toEqual([1, 2, 3, 4]);
    expect(fetchCalls).toHaveLength(3);
    expect(fetchCalls[0]?.url).toContain("page=1");
    expect(fetchCalls[1]?.url).toContain("page=2");
    expect(fetchCalls[2]?.url).toContain("page=3");
  });

  test("data 缺省 → 返回空数组,不抛", async () => {
    responses.set("/api/admin/contents", { pagination: { totalPages: 1 } });
    expect(await fetchAllAdminContents()).toEqual([]);
  });

  test("pagination.totalPages 缺省 → 当 1 处理,只发一次请求", async () => {
    responses.set("/api/admin/contents", { data: [{ cid: 1 }] });
    const items = await fetchAllAdminContents();
    expect(items.map(i => i.cid)).toEqual([1]);
    expect(fetchCalls).toHaveLength(1);
  });

  test("pageSize 固定 100(常量 PAGE_SIZE = 100)", async () => {
    responses.set("/api/admin/contents", {
      data: [{ cid: 1 }],
      pagination: { totalPages: 1 },
    });
    await fetchAllAdminContents();
    expect(fetchCalls[0]?.url).toContain("pageSize=100");
  });
});

describe("fetchAllAdminPages", () => {
  test("totalPages=1 → 返回首页 data", async () => {
    responses.set("/api/admin/pages", {
      data: [{ cid: 1, title: "p1" }],
      pagination: { totalPages: 1 },
    });
    const items = await fetchAllAdminPages();
    expect(items.map(i => i.cid)).toEqual([1]);
  });

  test("totalPages=2 → 聚合两页", async () => {
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
      fetchCalls.push({ url });
      const u = new URL("http://x" + url);
      const page = u.searchParams.get("page");
      if (page === "1") return { data: [{ cid: 1, title: "a" }], pagination: { totalPages: 2 } };
      return { data: [{ cid: 2, title: "b" }], pagination: { totalPages: 2 } };
    }) as typeof globalThis.$fetch;
    const items = await fetchAllAdminPages();
    expect(items.map(i => i.cid)).toEqual([1, 2]);
    expect(fetchCalls).toHaveLength(2);
  });

  test("data 缺省 → 返回空数组", async () => {
    responses.set("/api/admin/pages", { pagination: { totalPages: 1 } });
    expect(await fetchAllAdminPages()).toEqual([]);
  });

  test("pageSize 固定 100", async () => {
    responses.set("/api/admin/pages", {
      data: [{ id: "x" }],
      pagination: { totalPages: 1 },
    });
    await fetchAllAdminPages();
    expect(fetchCalls[0]?.url).toContain("pageSize=100");
  });

  test("totalPages=5 → 发 5 次请求聚合", async () => {
    responses.set("/api/admin/pages", (url: string) => {
      const page = Number(new URL(url, "http://x").searchParams.get("page")) || 1;
      return {
        data: [{ cid: page }],
        pagination: { totalPages: 5 },
      };
    });
    const items = await fetchAllAdminPages();
    expect(items.map(i => i.cid)).toEqual([1, 2, 3, 4, 5]);
    expect(fetchCalls).toHaveLength(5);
    // URL 按 page=1..5 顺序发
    const pageParams = fetchCalls.map(c => new URL(c.url, "http://x").searchParams.get("page"));
    expect(pageParams).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("pagination 字段为 undefined → totalPages 兜底 1,只发一次请求", async () => {
    responses.set("/api/admin/pages", { data: [{ cid: 1 }] });
    const items = await fetchAllAdminPages();
    expect(items).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
  });

  test("第 2/3 页 data 为空数组 → 聚合仍正确(空页不算错)", async () => {
    responses.set("/api/admin/pages", (url: string) => {
      const page = Number(new URL(url, "http://x").searchParams.get("page")) || 1;
      return {
        data: page === 1 ? [{ cid: 1 }, { cid: 2 }] : [],
        pagination: { totalPages: 3 },
      };
    });
    const items = await fetchAllAdminPages();
    expect(items.map(i => i.cid)).toEqual([1, 2]);
    expect(fetchCalls).toHaveLength(3);
  });
});

describe("fetchAllAdminContents 错误处理", () => {
  test("$fetch 第 1 页就抛 → 异常向上传", async () => {
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof globalThis.$fetch;
    await expect(fetchAllAdminContents()).rejects.toThrow(/network down/);
  });

  test("$fetch 第 2 页抛 → 异常向上传(后续页不重试)", async () => {
    let pageNum = 0;
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async () => {
      pageNum++;
      if (pageNum === 1) return { data: [{ cid: 1 }], pagination: { totalPages: 3 } };
      throw new Error(`page ${pageNum} failed`);
    }) as unknown as typeof globalThis.$fetch;
    await expect(fetchAllAdminContents()).rejects.toThrow(/page 2 failed/);
  });
});