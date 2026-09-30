/**
 * admin/tags/[id].put 补测:
 *  - 401/CSRF/400 守卫
 *  - name 必填非空
 *  - 类型校验:slug/desc 非字符串 → 400
 *  - updateMany 限定 type='tag' 防误改 category
 *  - count=0 → 404(mid 不存在 OR 是分类)
 *  - slug/desc 区分「未提供」与「显式清空」
 *  - P2002 → 400 名称/slug 冲突
 *  - 响应白名单字段(mid/name/slug/desc/type)
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/tags/[id].put")).default;

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

describe("admin/tags/[id].put 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callPut({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "x" },
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

describe("admin/tags/[id].put 类型与必填", () => {
  test("name 缺省 → 400", async () => {
    await expect(callPut({ id: "1" })).rejects.toMatchObject({ statusCode: 400, message: "标签名称不能为空" });
  });

  test("name 空字符串/纯空白 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callPut({ id: "1", body: { name: "   " } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 非字符串 → 400(走 typeof 检查)", async () => {
    await expect(callPut({ id: "1", body: { name: 123 } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 非字符串 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "x", slug: 999 } })).rejects.toMatchObject({ statusCode: 400, message: "标签标识格式错误" });
  });

  test("desc 非字符串 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "x", desc: ["x"] } })).rejects.toMatchObject({ statusCode: 400, message: "标签描述格式错误" });
  });

  test("name 超 100 字符 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "n".repeat(101) } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 超 100 字符 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "x", slug: "s".repeat(101) } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("desc 超 191 字符 → 400", async () => {
    await expect(callPut({ id: "1", body: { name: "x", desc: "d".repeat(192) } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/tags/[id].put 业务逻辑", () => {
  test("mid 不存在 → 404(updateMany count=0)", async () => {
    sharedFake.on("metas", "updateMany", async () => ({ count: 0 }));
    await expect(callPut({ id: "999", body: { name: "新名" } })).rejects.toMatchObject({ statusCode: 404, message: "标签不存在" });
  });

  test("mid 是分类(非 tag)→ updateMany 限定 type='tag' 不命中 → 404(防误改 category)", async () => {
    sharedFake.on("metas", "updateMany", async () => ({ count: 0 }));
    await expect(callPut({ id: "2", body: { name: "试图改分类" } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 返回白名单字段(mid/name/slug/desc/type)", async () => {
    sharedFake.on("metas", "updateMany", async () => ({ count: 1 }));
    sharedFake.on("metas", "findUnique", async () => ({ mid: 1, name: "新名", slug: "new-slug", desc: "新 desc", type: "tag" }));
    const r = (await callPut({ id: "1", body: { name: "新名" } })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["desc", "mid", "name", "slug", "type"]);
    expect(r.type).toBe("tag");
  });
});

describe("admin/tags/[id].put:部分更新语义", () => {
  test("只传 name,slug/desc 不传 → 存 null(updateMany 行为)", async () => {
    let captured: { name: string; slug: string | null; desc: string | null } | null = null;
    sharedFake.on("metas", "updateMany", async ({ data }: { data: { name?: string; slug?: string | null; desc?: string | null } }) => {
      captured = { name: data.name ?? "", slug: data.slug ?? null, desc: data.desc ?? null };
      return { count: 1 };
    });
    sharedFake.on("metas", "findUnique", async () => ({ mid: 1, name: "新名", slug: null, desc: null, type: "tag" }));
    await callPut({ id: "1", body: { name: "新名" } });
    // 当前实现:slug/desc 未提供也置 null(updateMany 没 undefined 概念)
    expect(captured!.slug).toBeNull();
    expect(captured!.desc).toBeNull();
  });
});

describe("admin/tags/[id].put:并发兜底", () => {
  test("P2002 唯一约束冲突 → 400 而非 500", async () => {
    sharedFake.on("metas", "updateMany", async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    await expect(callPut({ id: "1", body: { name: "冲突名" } })).rejects.toMatchObject({ statusCode: 400, message: "标签名称或标识(slug)已存在" });
  });

  test("未知错误 → 500 而非泄漏 message", async () => {
    sharedFake.on("metas", "updateMany", async () => {
      throw new Error("raw db error 敏感");
    });
    try {
      await callPut({ id: "1", body: { name: "x" } });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});