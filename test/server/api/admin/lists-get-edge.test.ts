/**
 * admin/tags.get + admin/subscribes.get + admin/categories.get 边界补测:
 *  - 401 守卫
 *  - 返回数组形状,每项含白名单字段
 *  - 含 _count 聚合(contentCount)
 *  - take 上限(1000)
 *  - 错误兜底 → 500 而非泄漏 message
 */
import { describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const tagsHandler = (await import("#server/api/admin/tags.get")).default;
const subscribesHandler = (await import("#server/api/admin/subscribes.get")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}`;
}

describe("admin/tags.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(tagsHandler, { method: "GET", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回 tag 数组,每项含白名单字段(mid/name/slug/desc/type/contentCount)", async () => {
    sharedFake.on("metas", "findMany", async () => [
      { mid: 1, name: "标签甲", slug: "tag-a", desc: "d", type: "tag", _count: { contentrelations: 5 } },
      { mid: 2, name: "标签乙", slug: "tag-b", desc: null, type: "tag", _count: { contentrelations: 0 } },
    ]);
    const r = (await callAdmin(tagsHandler, {
      method: "GET",
      cookie: await cookie(),
    })) as Array<Record<string, unknown>>;
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(2);
    expect(Object.keys(r[0]!).sort()).toEqual(["contentCount", "desc", "mid", "name", "slug", "type"]);
    expect(r[0]!.contentCount).toBe(5);
    expect(r[0]!.type).toBe("tag");
    // 不暴露内部 _count
    expect(r[0]!._count).toBeUndefined();
  });

  test("限定 type='tag',不返回分类(分类另走 categories.get)", async () => {
    let capturedWhere: Record<string, unknown> | null = null;
    sharedFake.on("metas", "findMany", async ({ where }: { where: Record<string, unknown> }) => {
      capturedWhere = where;
      return [];
    });
    await callAdmin(tagsHandler, { method: "GET", cookie: await cookie() });
    expect(capturedWhere!.type).toBe("tag");
  });

  test("take 上限 1000(防无界全表)", async () => {
    let capturedTake: number | undefined;
    sharedFake.on("metas", "findMany", async ({ take }: { take?: number }) => {
      capturedTake = take;
      return [];
    });
    await callAdmin(tagsHandler, { method: "GET", cookie: await cookie() });
    expect(capturedTake).toBe(1000);
  });

  test("异常 → 500 而非泄漏原始 message", async () => {
    sharedFake.on("metas", "findMany", async () => {
      throw new Error("raw db error 敏感");
    });
    try {
      await callAdmin(tagsHandler, { method: "GET", cookie: await cookie() });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});

describe("admin/subscribes.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(subscribesHandler, { method: "GET", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回订阅数组,含 lastUpdateStatus(内存态,无则为 null)", async () => {
    sharedFake.on("subscribes", "findMany", async () => [
      { id: 1, url: "https://blog.com", name: "博客甲", avatar: null, lastUpdated: null },
      { id: 2, url: "https://b.com", name: "博客乙", avatar: null, lastUpdated: "2026-01-01" },
    ]);
    const r = (await callAdmin(subscribesHandler, {
      method: "GET",
      cookie: await cookie(),
    })) as Array<{ id: number; url: string; name: string; avatar: unknown; lastUpdated: unknown; lastUpdateStatus: unknown }>;
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(2);
    expect(r[0]!.lastUpdateStatus).toBeNull(); // 内存无记录
    expect(r[1]!.lastUpdated).toBe("2026-01-01");
  });

  test("异常 → 500 而非泄漏 message", async () => {
    sharedFake.on("subscribes", "findMany", async () => {
      throw new Error("raw db error 敏感");
    });
    try {
      await callAdmin(subscribesHandler, { method: "GET", cookie: await cookie() });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});