import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/tag/[slug]/contents.get")).default;

const sampleTag = { mid: 10, name: "技术", slug: "tech", desc: null };

describe("tag/[slug]/contents.get(标签文章列表)", () => {
  test("slug 缺省 → 400", async () => {
    await expect(callAdmin(handler, { method: "GET", url: "/api/tag//contents", params: { slug: "" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("标签不存在 → 404", async () => {
    sharedFake.on("metas", "findFirst", async () => null);
    await expect(callAdmin(handler, { method: "GET", params: { slug: "noexist" } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("命中 → 返回 tag/contents/pagination,过滤 type=tag", async () => {
    sharedFake.on("metas", "findFirst", async ({ where }: { where: { slug: string; type: string } }) =>
      where.type === "tag" ? sampleTag : null);
    sharedFake.on("contentrelations", "count", async () => 1);
    sharedFake.on("contentrelations", "findMany", async () => [{
      mid: 10,
      content: {
        cid: 1,
        title: "test",
        slug: "test",
        desc: null,
        update_time: new Date(),
        create_time: new Date(),
        comment_num: 0,
        many_covers: null,
        covers: null,
        contentrelations: [
          { cid: 1, mid: 1, metas: { slug: "tech", name: "技术", type: "category" } },
        ],
        travels: [],
      },
    }]);
    const r = await callAdmin(handler, { method: "GET", params: { slug: "tech" } }) as { data: { tag: { name: string }; contents: Array<{ title: string; categorySlug: string }>; pagination: { total: number; page: number } } };
    expect(r.data.tag.name).toBe("技术");
    expect(r.data.contents[0]!.title).toBe("test");
    expect(r.data.contents[0]!.categorySlug).toBe("tech");
    expect(r.data.pagination.total).toBe(1);
  });

  test("page/pageSize 边界 → 钳到合法范围", async () => {
    sharedFake.on("metas", "findFirst", async () => sampleTag);
    sharedFake.on("contentrelations", "count", async () => 0);
    sharedFake.on("contentrelations", "findMany", async () => []);
    const r = await callAdmin(handler, { method: "GET", params: { slug: "tech" }, url: "/api/tag/tech/contents?page=0&pageSize=-1" }) as { data: { pagination: { page: number; pageSize: number } } };
    expect(r.data.pagination.page).toBe(1);
    expect(r.data.pagination.pageSize).toBeGreaterThanOrEqual(1);
  });
});