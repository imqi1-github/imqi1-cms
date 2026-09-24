import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

sharedFake.on("links", "findMany", () => [
  { id: 1, name: "友链甲", desc: "甲的博客", link: "https://a.com", avatar: "/uploads/a.png" },
  { id: 2, name: "友链乙", desc: null, link: "https://b.com", avatar: null },
]);

const handler = (await import("#server/api/links.get")).default as unknown as (e: unknown) => Promise<{ code: number; message: string; data: Array<Record<string, unknown>> }>;

describe("links.get(白名单范式)", () => {
  test("code 200 且 data 数量不因洗牌丢失", async () => {
    const r = await handler({ node: { req: { url: "/api/links", headers: {} } } });
    expect(r.code).toBe(200);
    expect(r.data).toHaveLength(2);
  });

  test("每条只含 id/name/desc/link/avatar 五键,内部审核字段不外泄(硬性约定 #1)", async () => {
    const r = await handler({ node: { req: { url: "/api/links", headers: {} } } });
    for (const item of r.data) {
      expect(Object.keys(item).sort()).toEqual(["avatar", "desc", "id", "link", "name"]);
    }
    expect(JSON.stringify(r)).not.toContain("enabled");
    expect(JSON.stringify(r)).not.toContain("isModification");
    expect(JSON.stringify(r)).not.toContain("modificationStatus");
    expect(JSON.stringify(r)).not.toContain("originalLinkId");
  });
});
