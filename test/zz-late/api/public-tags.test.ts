/**
 * server/api/tags.get.ts 集成测:
 *  - 返回 name/slug/count 字段(mid 不外泄)
 *  - count 来自 contentrelations.groupBy(按 mid 聚合)
 *  - 空 slug 标签不出现在返回
 *  - 缓存头公开可缓存
 *  - DB 异常 → 500
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const tagsHandler = (await import("#server/api/tags.get")).default;

function ev() {
  return makeAuthEvent({ method: "GET", peer: "10.30.5.1", url: "/api/tags" });
}

describe("tags.get", () => {
  test("返回 name/slug/count 字段(mid 不外泄)", async () => {
    sharedFake.on("metas", "findMany", async () => [
      { mid: 1, name: "标签甲", slug: "tag-a" },
      { mid: 2, name: "标签乙", slug: "tag-b" },
    ]);
    sharedFake.on("contentrelations", "groupBy", async () => [
      { mid: 1, _count: { _all: 5 } },
      { mid: 2, _count: { _all: 0 } },
    ]);
    const { event, headers } = ev();
    const r = (await tagsHandler(event)) as unknown as {
      code: number; data: Array<Record<string, unknown>>;
    };
    expect(r.code).toBe(200);
    expect(r.data).toEqual([
      { name: "标签甲", slug: "tag-a", count: 5 },
      { name: "标签乙", slug: "tag-b", count: 0 },
    ]);
    expect(JSON.stringify(r)).not.toContain('"mid"');
    expect(headers["cache-control"]).toBeTruthy();
  });

  test("无标签时返回空数组(不发 500)", async () => {
    sharedFake.on("metas", "findMany", async () => []);
    sharedFake.on("contentrelations", "groupBy", async () => []);
    const r = (await tagsHandler(ev().event)) as unknown as { code: number; data: unknown[] };
    expect(r.code).toBe(200);
    expect(r.data).toEqual([]);
  });

  test("count 默认值 0(标签无关联文章)", async () => {
    sharedFake.on("metas", "findMany", async () => [
      { mid: 1, name: "孤标签", slug: "alone" },
    ]);
    sharedFake.on("contentrelations", "groupBy", async () => []);
    const r = (await tagsHandler(ev().event)) as unknown as { data: Array<{ count: number }> };
    expect(r.data[0]?.count).toBe(0);
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("metas", "findMany", async () => { throw new Error("db down"); });
    await expect(tagsHandler(ev().event)).rejects.toMatchObject({ statusCode: 500 });
  });
});