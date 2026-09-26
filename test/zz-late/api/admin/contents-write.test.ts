import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

const fakePrisma = await import("#test/helpers/fake-prisma");

// mock 掉文件级附件清理 util(source 直接 import,不走 prisma)
mock.module("#server/utils/attachment-cleanup", () => ({
  deleteOrphanAttachments: async () => {},
}));

// ===== contents 假件(POST/PUT 测校验与基础流程,事务部分不强测) =====
const contentRows: Array<Record<string, unknown>> = [];
contentRows.push({ cid: 1, title: "已存在文", slug: "exists", type: 0, status: 1 });
contentRows.push({ cid: 2, title: "另一篇", slug: "another", type: 0, status: 1 });

fakePrisma.sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number } }) => {
  const r = contentRows.find(c => c.cid === where.cid);
  return r ? { ...r } : null;
});
// contentattachments 关联附件(被 delete 流程 findMany)
fakePrisma.sharedFake.on("contentattachments", "findMany", async () => []);
fakePrisma.sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
fakePrisma.sharedFake.on("contentattachments", "deleteMany", async () => ({ count: 0 }));
fakePrisma.sharedFake.on("comments", "deleteMany", async () => ({ count: 0 }));
fakePrisma.sharedFake.on("contents", "findFirst", async ({ where }: { where: { slug?: string; type?: number } } = { where: {} }) => {
  const r = contentRows.find(c => {
    if (where.slug !== undefined && c.slug !== where.slug) return false;
    if (where.type !== undefined && c.type !== where.type) return false;
    return true;
  });
  return r ? { ...r } : null;
});
fakePrisma.sharedFake.on("contents", "create", async ({ data }: { data: Record<string, unknown> }) => {
  const cid = contentRows.length + 100;
  const row = { cid, ...data, create_time: new Date() };
  contentRows.push(row);
  return { ...row };
});
fakePrisma.sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }, data: Record<string, unknown> }) => {
  const row = contentRows.find(c => c.cid === where.cid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  Object.assign(row, data);
  return { ...row };
});
fakePrisma.sharedFake.on("contents", "delete", async ({ where }: { where: { cid: number } }) => {
  const i = contentRows.findIndex(c => c.cid === where.cid);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  contentRows.splice(i, 1);
  return {};
});
fakePrisma.sharedFake.on("contents", "deleteMany", async ({ where }: { where: { cid: { in: number[] } } }) => {
  const ids = where.cid.in;
  let count = 0;
  for (let i = contentRows.length - 1; i >= 0; i--) {
    if (ids.includes(contentRows[i]!.cid as number)) {
      contentRows.splice(i, 1);
      count++;
    }
  }
  return { count };
});

const postHandler = (await import("#server/api/admin/contents.post")).default;
const putHandler = (await import("#server/api/admin/contents/[cid].put")).default;
const deleteHandler = (await import("#server/api/admin/contents/[cid].delete")).default;
const batchDeleteHandler = (await import("#server/api/admin/contents/batch-delete.post")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  contentRows.length = 0;
  contentRows.push({ cid: 1, title: "已存在文", slug: "exists", type: 0, status: 1 });
  contentRows.push({ cid: 2, title: "另一篇", slug: "another", type: 0, status: 1 });
});

describe("contents.post(创建文章/页面)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { title: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { title: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("title 缺省 → 400 标题不能为空", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/标题不能为空/);
  });

  test("title 非字符串 → 400", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { title: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/标题格式/);
  });

  test("status 非法(2)→ 400 状态无效", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { title: "x", status: 2, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/状态无效/);
  });

  test("type 非法(2)→ 400 类型无效", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { title: "x", type: 2, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/类型无效/);
  });

  test("slug 与已有 → 400", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { title: "新", slug: "exists", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/slug|已存在/);
  });

  test("成功:基础字段 + 状态 0/1 + 类型 0/1", async () => {
    const r = await callAdmin(postHandler, {
      method: "POST",
      body: { title: "新文章", slug: "new", status: 1, type: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, data: { cid: number } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBeGreaterThan(0);
  });

  test("成功:type=1(页面)", async () => {
    await callAdmin(postHandler, {
      method: "POST",
      body: { title: "关于页", slug: "about", type: 1, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    // slug 唯一(限 type=1 范围内)
    const created = contentRows.find(c => c.slug === "about");
    expect(created).toBeDefined();
    expect(created!.type).toBe(1);
  });
});

describe("contents/[cid].put(更新文章)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { cid: "1" },
      cookie: CSRF_COOKIE,
      body: { title: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { cid: "1" },
      body: { title: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 cid → 400", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { cid: "abc" },
      body: { title: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 不存在 → 404", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { cid: "999" },
      body: { title: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("title 空字符串 → 400", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { cid: "1" },
      body: { title: "", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/标题/);
  });

  test("slug 与其他文章冲突 → 400", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { cid: "1" },
      body: { title: "新名", slug: "another", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("成功更新 title", async () => {
    await callAdmin(putHandler, {
      method: "PUT",
      params: { cid: "1" },
      body: { title: "新标题", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    const row = contentRows.find(c => c.cid === 1);
    expect(row!.title).toBe("新标题");
  });
});

describe("contents/[cid].delete(删除文章)", () => {
  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { cid: "1" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 cid → 400", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { cid: "abc" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 不存在 → 404", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { cid: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toThrow();
  });

  test("成功删除", async () => {
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { cid: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(contentRows).toHaveLength(1);
  });
});

describe("contents/batch-delete.post(批量删除)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { ids: [1], csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [1] },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("ids 空数组 → 400", async () => {
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("ids 全为非正整数 → 400(filter 后空数组)", async () => {
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [-1, 0, -2], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/文章 ID 无效/);
  });

  test("成功批量删除", async () => {
    const r = await callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [1, 2], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, count: number };
    expect(r.success).toBe(true);
    expect(r.count).toBe(2);
    expect(contentRows).toHaveLength(0);
  });
});
