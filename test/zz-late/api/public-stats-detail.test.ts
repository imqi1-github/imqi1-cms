/**
 * server/api/stats.get.ts 集成测:
 *  - 四个 count 并行执行(并发性不在此验证,只断言结果聚合)
 *  - 空库(0/0/0/0) → 200 不抛
 *  - 任一 count 抛错 → 500(泛化错,不泄漏内部细节)
 *  - success/data 包络结构(与公开接口白名单口径一致)
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const statsHandler = (await import("#server/api/stats.get")).default;

function makeCountHandlers(overrides: Partial<{
  contents: number; comments: number; metasCategory: number; metasTag: number;
}> = {}) {
  const counts = {
    contents: 0,
    comments: 0,
    metasCategory: 0,
    metasTag: 0,
    ...overrides,
  };
  sharedFake.on("contents", "count", async () => counts.contents);
  sharedFake.on("comments", "count", async () => counts.comments);
  sharedFake.on("metas", "count", async ({ where }: { where: { type: string } }) =>
    where.type === "category" ? counts.metasCategory : counts.metasTag);
}

describe("stats.get(站点统计)", () => {
  test("聚合四个 count → success/data 包络 + 数值正确", async () => {
    makeCountHandlers({ contents: 12, comments: 34, metasCategory: 5, metasTag: 7 });
    const r = (await callAdmin(statsHandler, {
      method: "GET",
      url: "/api/stats",
    })) as unknown as { success: boolean; data: Record<string, number> };
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      publishedContentsNum: 12,
      publishedCommentsNum: 34,
      categoriesNum: 5,
      tagsNum: 7,
    });
  });

  test("空库(全 0)→ 200 data 全 0", async () => {
    makeCountHandlers();
    const r = (await callAdmin(statsHandler, { method: "GET", url: "/api/stats" })) as unknown as {
      data: Record<string, number>;
    };
    expect(r.data).toEqual({
      publishedContentsNum: 0,
      publishedCommentsNum: 0,
      categoriesNum: 0,
      tagsNum: 0,
    });
  });

  test("contents.count 抛错 → 500(泛化文案,不泄漏 Prisma 细节)", async () => {
    sharedFake.on("contents", "count", async () => { throw new Error("db pool exhausted"); });
    sharedFake.on("comments", "count", async () => 1);
    sharedFake.on("metas", "count", async () => 1);
    await expect(callAdmin(statsHandler, { method: "GET", url: "/api/stats" }))
      .rejects.toMatchObject({ statusCode: 500 });
  });

  test("metas.count 抛错 → 500", async () => {
    sharedFake.on("contents", "count", async () => 1);
    sharedFake.on("comments", "count", async () => 1);
    sharedFake.on("metas", "count", async () => { throw new Error("relation timeout"); });
    await expect(callAdmin(statsHandler, { method: "GET", url: "/api/stats" }))
      .rejects.toMatchObject({ statusCode: 500 });
  });
});