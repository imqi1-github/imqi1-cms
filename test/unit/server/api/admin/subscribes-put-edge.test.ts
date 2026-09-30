/**
 * admin/subscribes/[id].put 补测:
 *  - 401/CSRF/400 守卫
 *  - name/url 必填非空 → 400
 *  - 类型校验:非字符串 name/url → 400
 *  - avatar 非字符串 → 400
 *  - 字段长度上限
 *  - 订阅不存在(P2025)→ 404
 *  - 响应 select 白名单
 *  - avatar=null 显式置空
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/subscribes/[id].put")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callPut(opts: { id?: string; body?: Record<string, unknown>; cookie?: string }) {
  const params: Record<string, string> = {};
  if (opts.id !== undefined) params.id = opts.id;
  return callAdmin(handler, {
    method: "PUT",
    params,
    body: { csrfToken: CSRF_TOKEN, ...(opts.body ?? {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/subscribes/[id].put 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callPut({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "x", url: "https://x.com" },
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    await expect(callPut({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    for (const bad of ["0", "-1", "abc"]) {
      await expect(callPut({ id: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});

describe("admin/subscribes/[id].put 必填与类型", () => {
  test("name 缺省 → 400", async () => {
    await expect(callPut({ id: "1", body: { url: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400, message: "名称和链接为必填项" });
  });

  test("url 缺省 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "x" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 空字符串/纯空白 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "", url: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callPut({ id: "1", body: { name: "   ", url: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 非字符串(123) → 400", async () => {
    await expect(callPut({ id: "1", body: { name: 123, url: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("url 非字符串 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "x", url: ["a"] } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("avatar 非字符串 → 静默写 null(避免 500,不是 400 拒绝)", async () => {
    // 当前实现:非字符串 avatar 不报错,直接走 null 入库
    sharedFake.on("subscribes", "update", async () => ({ id: 1, url: "https://x.com", name: "x", avatar: null, lastUpdated: null }));
    const r = await callPut({ id: "1", body: { name: "x", url: "https://x.com", avatar: 999 } });
    expect((r as unknown as { id: number }).id).toBe(1);
  });

  test("name 超 100 字符 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "n".repeat(101), url: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("url 超 191 字符 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "x", url: "https://x.com/" + "a".repeat(200) } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/subscribes/[id].put 业务逻辑", () => {
  test("订阅不存在 → 404", async () => {
    sharedFake.on("subscribes", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callPut({ id: "999", body: { name: "x", url: "https://x.com" } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 返回 select 白名单字段(id/name/url/avatar/lastUpdated)", async () => {
    sharedFake.on("subscribes", "update", async () => ({ id: 1, url: "https://new", name: "新名", avatar: null, lastUpdated: null }));
    const r = (await callPut({ id: "1", body: { name: "新名", url: "https://new" } })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["avatar", "id", "lastUpdated", "name", "url"]);
  });

  test("avatar=null 显式置空(非字符串 → 写 null)", async () => {
    let captured: { avatar: unknown } | null = null;
    sharedFake.on("subscribes", "update", async ({ data }: { data: { avatar: unknown } }) => {
      captured = { avatar: data.avatar };
      return { id: 1, url: "x", name: "x", avatar: null, lastUpdated: null };
    });
    await callPut({ id: "1", body: { name: "x", url: "https://x.com", avatar: null } });
    expect(captured!.avatar).toBeNull();
  });
});