import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

registerMetasFakes();

const tagCreateHandler = (await import("#server/api/admin/tags.post")).default;
const tagPutHandler = (await import("#server/api/admin/tags/[id].put")).default;
const tagDeleteHandler = (await import("#server/api/admin/tags/[id].delete")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  registerMetasFakes();
});

describe("tags.post(创建)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { name: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403(已登录但 body 无 csrfToken)", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("CSRF 不匹配 → 403", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "x", csrfToken: "wrong" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name 空字符串 → 400", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "标签名称不能为空" });
  });

  test("name 非字符串(数字)→ 400", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 非字符串 → 400", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "x", slug: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "标签标识格式错误" });
  });

  test("成功:name + slug + desc", async () => {
    const r = await callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "新标签", slug: "new", desc: "d", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { mid: number, name: string, slug: string | null };
    expect(r.name).toBe("新标签");
    expect(r.slug).toBe("new");
  });

  test("成功:无 slug/desc → 存 null", async () => {
    const r = await callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "无slug", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { slug: string | null };
    expect(r.slug).toBeNull();
  });

  test("P2002 重名 → 400(不打印堆栈)", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "标签甲", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/已存在/);
  });

  test("slug 与已有 → 400", async () => {
    await expect(callAdmin(tagCreateHandler, {
      method: "POST",
      body: { name: "新名字", slug: "tag-a", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("tags/[id].put(更新)", () => {
  test("非法 id → 400", async () => {
    await expect(callAdmin(tagPutHandler, {
      method: "PUT",
      params: { id: "abc" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "无效的标签 ID" });
  });

  test("负数 id → 400", async () => {
    await expect(callAdmin(tagPutHandler, {
      method: "PUT",
      params: { id: "-1" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404(P2025)", async () => {
    await expect(callAdmin(tagPutHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("CSRF 缺失 → 403(已登录但 body 无 csrfToken)", async () => {
    await expect(callAdmin(tagPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功更新 name/slug/desc", async () => {
    const r = await callAdmin(tagPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "新名", slug: "new-slug", desc: "新描述", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { name: string, slug: string };
    expect(r.name).toBe("新名");
    expect(r.slug).toBe("new-slug");
  });
});

describe("tags/[id].delete(删除)", () => {
  // DELETE 端点 CSRF 走 header `x-csrf-token` 而非 body(memory 钉过)

  test("非法 id → 400", async () => {
    await expect(callAdmin(tagDeleteHandler, {
      method: "DELETE",
      params: { id: "abc" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(tagDeleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功删除", async () => {
    const r = await callAdmin(tagDeleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });
    expect(r).toBeDefined();
  });

  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(tagDeleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});
