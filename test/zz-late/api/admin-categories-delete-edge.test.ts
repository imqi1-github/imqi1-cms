import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/categories/[id].delete")).default;

// seed: 2 个 category(满足 ≥2 守卫),1 个 tag
const seedWith2Cats = [
  { mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
  { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
  { mid: 3, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
];

describe("admin/categories/[id].delete 500 fallback", () => {
  test("metas.delete P2025 → 404", async () => {
    registerMetasFakes(seedWith2Cats);
    sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> }) => {
      if (where.mid === 2 && where.type === "category") return { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" };
      return null;
    });
    sharedFake.on("contentrelations", "findMany", async () => []);
    sharedFake.on("metas", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "2" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("非 Prisma 未知异常 → 500", async () => {
    registerMetasFakes(seedWith2Cats);
    sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> }) => {
      if (where.mid === 2 && where.type === "category") return { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" };
      return null;
    });
    sharedFake.on("contentrelations", "findMany", async () => []);
    sharedFake.on("metas", "delete", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "2" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});