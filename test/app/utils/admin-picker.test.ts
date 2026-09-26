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
    return responses.get(key);
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
      data: [{ id: 1 }, { id: 2 }],
      pagination: { totalPages: 1 },
    });
    const items = await fetchAllAdminContents();
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchCalls.filter(c => c.url.startsWith("/api/admin/contents"))).toHaveLength(1);
  });

  test("totalPages=3 → 发 3 次,聚合所有页 data", async () => {
    responses.set("/api/admin/contents", {
      data: [{ id: 1 }, { id: 2 }],
      pagination: { totalPages: 3 },
    });
    // 第 2、3 页的 mock(分页参数不同):用 searchParams 区分
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
      fetchCalls.push({ url });
      const u = new URL("http://x" + url);
      const page = u.searchParams.get("page");
      if (page === "1") return { data: [{ id: 1 }], pagination: { totalPages: 3 } };
      if (page === "2") return { data: [{ id: 2 }, { id: 3 }], pagination: { totalPages: 3 } };
      if (page === "3") return { data: [{ id: 4 }], pagination: { totalPages: 3 } };
      return { data: [], pagination: { totalPages: 3 } };
    }) as typeof globalThis.$fetch;

    const items = await fetchAllAdminContents();
    expect(items.map(i => i.id)).toEqual([1, 2, 3, 4]);
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
    responses.set("/api/admin/contents", { data: [{ id: 1 }] });
    const items = await fetchAllAdminContents();
    expect(items).toEqual([{ id: 1 }]);
    expect(fetchCalls).toHaveLength(1);
  });

  test("pageSize 固定 100(常量 PAGE_SIZE = 100)", async () => {
    responses.set("/api/admin/contents", {
      data: [{ id: 1 }],
      pagination: { totalPages: 1 },
    });
    await fetchAllAdminContents();
    expect(fetchCalls[0]?.url).toContain("pageSize=100");
  });
});

describe("fetchAllAdminPages", () => {
  test("totalPages=1 → 返回首页 data", async () => {
    responses.set("/api/admin/pages", {
      data: [{ id: "p1" }],
      pagination: { totalPages: 1 },
    });
    const items = await fetchAllAdminPages();
    expect(items).toEqual([{ id: "p1" }]);
  });

  test("totalPages=2 → 聚合两页", async () => {
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
      fetchCalls.push({ url });
      const u = new URL("http://x" + url);
      const page = u.searchParams.get("page");
      if (page === "1") return { data: [{ id: "a" }], pagination: { totalPages: 2 } };
      return { data: [{ id: "b" }], pagination: { totalPages: 2 } };
    }) as typeof globalThis.$fetch;
    const items = await fetchAllAdminPages();
    expect(items.map(i => i.id)).toEqual(["a", "b"]);
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
});