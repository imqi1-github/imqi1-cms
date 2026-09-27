import { describe, expect, mock, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// mock rss.getSubscribePosts 返回可控数据
const subscribeData: unknown[] = [];
mock.module("#server/utils/rss", () => ({
  getSubscribePosts: async () => subscribeData,
}));

const handler = (await import("#server/api/subscribes.get")).default;

describe("subscribes.get(订阅文章列表)", () => {
  test("无 limit → 返回全部", async () => {
    subscribeData.length = 0;
    subscribeData.push({ id: 1, title: "a" }, { id: 2, title: "b" }, { id: 3, title: "c" });
    const r = await callAdmin(handler, { method: "GET", url: "/api/subscribes" }) as { success: boolean; data: unknown[] };
    expect(r.data).toHaveLength(3);
  });

  test("limit=2 → 截断前 2 条", async () => {
    subscribeData.length = 0;
    subscribeData.push({ id: 1, title: "a" }, { id: 2, title: "b" }, { id: 3, title: "c" });
    const r = await callAdmin(handler, { method: "GET", url: "/api/subscribes?limit=2" }) as { data: unknown[] };
    expect(r.data).toHaveLength(2);
  });

  test("limit=0 → 钳到 1(下限)", async () => {
    subscribeData.length = 0;
    subscribeData.push({ id: 1 });
    const r = await callAdmin(handler, { method: "GET", url: "/api/subscribes?limit=0" }) as { data: unknown[] };
    expect(r.data).toHaveLength(1);
  });

  test("limit=999 → 钳到 30(上限)", async () => {
    subscribeData.length = 0;
    for (let i = 0; i < 50; i++) subscribeData.push({ id: i });
    const r = await callAdmin(handler, { method: "GET", url: "/api/subscribes?limit=999" }) as { data: unknown[] };
    expect(r.data).toHaveLength(30);
  });

  test("limit 非字符串(数组)→ 400", async () => {
    await expect(callAdmin(handler, { method: "GET", url: "/api/subscribes?limit=a&limit=b" })).rejects.toMatchObject({ statusCode: 400 });
  });
});