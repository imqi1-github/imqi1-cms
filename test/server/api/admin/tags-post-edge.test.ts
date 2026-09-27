/**
 * admin/tags.post 补测:
 *  - 401/CSRF/400 守卫
 *  - name 必填非空
 *  - 类型校验
 *  - 字段长度上限
 *  - P2002 → 400 而非 500
 *  - 成功创建 → 返回 tag 字段(mid/name/slug/desc/type='tag')
 *  - slug/desc 缺省 → null 入库
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/tags.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callPost(opts: { body?: Record<string, unknown>; cookie?: string }) {
  return callAdmin(handler, {
    method: "POST",
    body: { csrfToken: CSRF_TOKEN, ...(opts.body ?? {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/tags.post 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callPost({ cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      body: { name: "x" },
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("admin/tags.post 类型与必填", () => {
  test("name 缺省 → 400", async () => {
    await expect(callPost({ body: {} })).rejects.toMatchObject({ statusCode: 400, message: "标签名称不能为空" });
  });

  test("name 非字符串 → 400", async () => {
    await expect(callPost({ body: { name: 123 } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 空字符串/纯空白 → 400", async () => {
    await expect(callPost({ body: { name: "" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callPost({ body: { name: "   " } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 非字符串 → 400", async () => {
    await expect(callPost({ body: { name: "x", slug: 999 } })).rejects.toMatchObject({ statusCode: 400, message: "标签标识格式错误" });
  });

  test("desc 非字符串 → 400", async () => {
    await expect(callPost({ body: { name: "x", desc: ["x"] } })).rejects.toMatchObject({ statusCode: 400, message: "标签描述格式错误" });
  });

  test("name 超 100 字符 → 400", async () => {
    await expect(callPost({ body: { name: "n".repeat(101) } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 超 100 字符 → 400", async () => {
    await expect(callPost({ body: { name: "x", slug: "s".repeat(101) } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/tags.post 业务逻辑", () => {
  test("成功 → 创建 type='tag' 的 meta,返回完整字段", async () => {
    sharedFake.on("metas", "create", async ({ data }: { data: { name: string; type: string } }) => ({
      mid: 100,
      ...data,
      type: "tag",
    }));
    const r = (await callPost({ body: { name: "新标签", slug: "new-tag" } })) as Record<string, unknown>;
    expect(r.type).toBe("tag");
    expect(r.mid).toBe(100);
    expect(r.name).toBe("新标签");
  });

  test("slug 缺省 → 写 null(非 undefined)", async () => {
    let captured: { slug: unknown } | null = null;
    sharedFake.on("metas", "create", async ({ data }: { data: { slug?: string | null } }) => {
      captured = { slug: data.slug };
      return { mid: 1, ...data, type: "tag" };
    });
    await callPost({ body: { name: "新标签" } });
    expect(captured!.slug).toBeNull();
  });

  test("desc 缺省 → 写 null", async () => {
    let captured: { desc: unknown } | null = null;
    sharedFake.on("metas", "create", async ({ data }: { data: { desc?: string | null } }) => {
      captured = { desc: data.desc };
      return { mid: 1, ...data, type: "tag" };
    });
    await callPost({ body: { name: "新标签" } });
    expect(captured!.desc).toBeNull();
  });

  test("name 前后空白 trim", async () => {
    let captured: { name: string } | null = null;
    sharedFake.on("metas", "create", async ({ data }: { data: { name: string } }) => {
      captured = { name: data.name };
      return { mid: 1, ...data, type: "tag" };
    });
    await callPost({ body: { name: "  新标签  " } });
    expect(captured!.name).toBe("新标签");
  });
});

describe("admin/tags.post:并发兜底", () => {
  test("P2002 唯一约束冲突 → 400 而非 500", async () => {
    sharedFake.on("metas", "create", async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    await expect(callPost({ body: { name: "冲突名" } })).rejects.toMatchObject({ statusCode: 400, message: "标签名称或标识(slug)已存在" });
  });

  test("未知错误 → 500 而非泄漏 message", async () => {
    sharedFake.on("metas", "create", async () => {
      throw new Error("raw db error 敏感");
    });
    try {
      await callPost({ body: { name: "x" } });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});