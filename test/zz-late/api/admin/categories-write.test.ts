import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

registerMetasFakes();

const createHandler = (await import("#server/api/admin/categories/create.post")).default;
const putHandler = (await import("#server/api/admin/categories/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/categories/[id].delete")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  registerMetasFakes([
    { mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
    { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
    { mid: 3, name: "标签乙", slug: "tag-b", desc: null, type: "tag" },
    { mid: 4, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
  ]);
});

describe("categories/create.post", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { name: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name 空字符串 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称不能为空" });
  });

  test("name 非字符串 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称格式错误" });
  });

  test("slug 非字符串 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", slug: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类标识格式错误" });
  });

  test("分类名重名 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "分类甲", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称已存在" });
  });

  test("slug 重名 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "新名", slug: "cat-a", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类标识已存在" });
  });

  test("成功:name + slug + desc → 返回 { success, data }", async () => {
    const r = await callAdmin(createHandler, {
      method: "POST",
      body: { name: "新分类", slug: "new", desc: "d", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, data: { name: string, slug: string | null } };
    expect(r.success).toBe(true);
    expect(r.data.name).toBe("新分类");
    expect(r.data.slug).toBe("new");
  });

  test("成功:无 slug/desc → null", async () => {
    const r = await callAdmin(createHandler, {
      method: "POST",
      body: { name: "无slug分类", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { data: { slug: string | null, desc: string | null } };
    expect(r.data.slug).toBeNull();
    expect(r.data.desc).toBeNull();
  });
});

describe("categories/[id].delete(再注册)", () => {
  beforeEach(() => {
    registerMetasFakes([
      { mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
      { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
      { mid: 3, name: "标签乙", slug: "tag-b", desc: null, type: "tag" },
      { mid: 4, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
    ]);
  });
  test("id 不存在 → 404", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功删除", async () => {
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "2" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });
    expect(r).toBeDefined();
  });

  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "2" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("categories/[id].put", () => {
  test("非法 id → 400", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "abc" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功更新", async () => {
    const r = await callAdmin(putHandler, {
      method: "PUT",
      params: { id: "2" },
      body: { name: "新名", slug: "new", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, data: { name: string } };
    expect(r.success).toBe(true);
    expect(r.data.name).toBe("新名");
  });
});

beforeEach(() => {
  // 至少 2 个分类以满足「至少保留一个分类」守卫
  registerMetasFakes([
    { mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
    { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
    { mid: 3, name: "标签乙", slug: "tag-b", desc: null, type: "tag" },
    { mid: 4, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
  ]);
});

describe("categories/[id].delete", () => {
  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "2" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功删除", async () => {
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "2" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });
    expect(r).toBeDefined();
  });
});
