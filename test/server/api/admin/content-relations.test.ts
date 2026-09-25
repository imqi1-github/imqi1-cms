import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie, metas, registerMetasFakes, resetMetas } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// 复用共享 metas 表(不本地覆盖 handler,避免跨文件争用);种子:两个分类 + 一个标签
const SEED = [
  { mid: 1, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
  { mid: 2, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
  { mid: 3, name: "标签丙", slug: "tag-c", desc: null, type: "tag" },
];

let relations: Array<{ cid: number; mid: number }> = [];
const contents = [{ cid: 10 }, { cid: 20 }];

// contentrelations 假件:各测试文件共用同一张 handler 表,这里在 beforeEach 重注册抢占
function registerRelationFakes(): void {
  sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number } }) =>
    contents.find(c => c.cid === where.cid) ? { cid: where.cid } : null);

  sharedFake.on("contentrelations", "findMany", async ({ where }: { where: { cid: number; metas?: { type: string } } }) =>
    relations
      .filter(r => r.cid === where.cid)
      .map(r => ({ mid: r.mid, metas: metas.find(m => m.mid === r.mid)! }))
      .filter(r => !where.metas || r.metas.type === where.metas.type)
      .map(r => ({ mid: r.mid, metas: { mid: r.metas.mid, name: r.metas.name, slug: r.metas.slug, desc: r.metas.desc } })));

  sharedFake.on("contentrelations", "deleteMany", async ({ where }: { where: { cid?: number; mid?: number; metas?: { type: string } } }) => {
    const before = relations.length;
    relations = relations.filter(r => {
      if (where.mid !== undefined) return r.mid !== where.mid;
      if (where.cid !== undefined) {
        const m = metas.find(x => x.mid === r.mid);
        const hit = r.cid === where.cid && (!where.metas || m?.type === where.metas.type);
        return !hit;
      }
      return true;
    });
    return { count: before - relations.length };
  });

  sharedFake.on("contentrelations", "createMany", async ({ data }: { data: Array<{ cid: number; mid: number }> }) => {
    data.forEach(d => relations.push({ cid: d.cid, mid: d.mid }));
    return { count: data.length };
  });
}

const getCat = (await import("#server/api/admin/content-categories/[id].get")).default;
const putCat = (await import("#server/api/admin/content-categories/[id].put")).default;
const getTag = (await import("#server/api/admin/content-tags/[id].get")).default;
const putTag = (await import("#server/api/admin/content-tags/[id].put")).default;

beforeEach(() => {
  registerMetasFakes();
  resetMetas(SEED);
  relations = [
    { cid: 10, mid: 1 }, // 分类甲
    { cid: 10, mid: 3 }, // 标签丙(同表,须与分类区分)
  ];
  registerRelationFakes();
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/content-categories", () => {
  test("未登录 → 401;非法 cid → 400", async () => {
    await expect(callAdmin(getCat, {})).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(getCat, { method: "GET", params: { id: "abc" }, cookie: session })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("GET 只回该文章的分类关系(同表标签不混入)", async () => {
    const r = (await callAdmin(getCat, { method: "GET", params: { id: "10" }, cookie: await loginSessionCookie() })) as { data: Array<{ mid: number }> };
    expect(r.data.map(m => m.mid)).toEqual([1]);
  });

  test("PUT:categoryIds 非数组 → 400;含标签 mid → 400 存在无效的分类", async () => {
    const c = await cookie();
    await expect(callAdmin(putCat, { method: "PUT", params: { id: "10" }, cookie: c, body: { categoryIds: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(putCat, { method: "PUT", params: { id: "10" }, cookie: c, body: { categoryIds: [3], csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的分类" });
  });

  test("PUT:文章不存在 → 404;成功替换分类且不动标签关系", async () => {
    const c = await cookie();
    await expect(callAdmin(putCat, { method: "PUT", params: { id: "999" }, cookie: c, body: { categoryIds: [1], csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });

    await callAdmin(putCat, { method: "PUT", params: { id: "10" }, cookie: c, body: { categoryIds: [1, 2], csrfToken: CSRF_TOKEN } });
    expect(relations.filter(r => r.cid === 10 && r.mid !== 3).map(r => r.mid).sort()).toEqual([1, 2]);
    expect(relations.some(r => r.cid === 10 && r.mid === 3)).toBe(true);
  });
});

describe("admin/content-tags", () => {
  test("GET 只回标签关系;PUT 替换标签不动分类", async () => {
    const session = await loginSessionCookie();
    const got = (await callAdmin(getTag, { method: "GET", params: { id: "10" }, cookie: session })) as { data: Array<{ mid: number }> };
    expect(got.data.map(m => m.mid)).toEqual([3]);

    await callAdmin(putTag, { method: "PUT", params: { id: "10" }, cookie: await cookie(), body: { tagIds: [3], csrfToken: CSRF_TOKEN } });
    expect(relations.some(r => r.cid === 10 && r.mid === 1)).toBe(true);
    expect(relations.filter(r => r.cid === 10 && r.mid === 3)).toHaveLength(1);
  });

  test("PUT:tagIds 含分类 mid → 400", async () => {
    await expect(callAdmin(putTag, { method: "PUT", params: { id: "10" }, cookie: await cookie(), body: { tagIds: [1], csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });
});
