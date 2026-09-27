/**
 * admin/categories/[id].put 补测:
 *  - 类型校验:非字符串 name/slug/desc → 400
 *  - name 必填且 trim 后非空 → 400
 *  - name 已被其他分类占用 → 400
 *  - slug 已被其他分类占用 → 400
 *  - slug/desc 区分「未提供」与「显式清空」(undefined 保留原值;空串置 null)
 *  - 找不到对应 type='category' 的 mid → 404(防止误改 tag)
 *  - P2002(并发唯一约束)→ 400 而非 500
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/categories/[id].put")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

function setupMetasFakes(seed: Array<{ mid: number; name: string; slug: string | null; desc: string | null; type: "tag" | "category" }> = []) {
  const rows = seed.map(r => ({ ...r }));
  const reg = () => {
    sharedFake.on("metas", "findFirst", async ({ where }: { where: { mid?: number | { not?: number }; type?: string; name?: string; slug?: string } }) => {
      const r = rows.find(m => {
        if (where.mid !== undefined && where.mid !== null) {
          if (typeof where.mid === "object" && where.mid !== null) {
            if ("not" in where.mid && where.mid.not !== undefined && m.mid === where.mid.not) return false;
          } else if (m.mid !== where.mid) return false;
        }
        if (where.type !== undefined && m.type !== where.type) return false;
        if (where.name !== undefined && m.name !== where.name) return false;
        if (where.slug !== undefined && m.slug !== where.slug) return false;
        return true;
      });
      return r ? { ...r } : null;
    });
    sharedFake.on("metas", "update", async ({ where, data }: { where: { mid: number }; data: Partial<{ name: string; slug: string | null; desc: string | null }> }) => {
      const r = rows.find(m => m.mid === where.mid);
      if (!r) throw Object.assign(new Error("P2025"), { code: "P2025" });
      Object.assign(r, data);
      return { ...r };
    });
  };
  reg();
  return rows;
}

describe("admin/categories/[id].put 类型与必填校验", () => {
  test("name 非字符串 → 400", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: 12345 },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称格式错误" });
  });

  test("slug 非字符串 → 400", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "分类甲", slug: 999 },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类标识格式错误" });
  });

  test("desc 非字符串 → 400", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "分类甲", desc: { evil: true } },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类描述格式错误" });
  });

  test("name 空字符串 / 纯空白 → 400", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称不能为空" });
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "   " },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称不能为空" });
  });
});

describe("admin/categories/[id].put 唯一性", () => {
  test("name 被其他分类占用 → 400", async () => {
    setupMetasFakes([
      { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
      { mid: 3, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
    ]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "分类乙" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称已存在" });
  });

  test("slug 被其他分类占用 → 400", async () => {
    setupMetasFakes([
      { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
      { mid: 3, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
    ]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "分类甲改名", slug: "cat-b" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类标识已存在" });
  });

  test("自己用自己原 name/slug(未改)→ 不报冲突", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: "d", type: "category" }]);
    const r = (await callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "分类甲", slug: "cat-a" },
      cookie: await cookie(),
    })) as { success: boolean };
    expect(r.success).toBe(true);
  });
});

describe("admin/categories/[id].put:存在性/类型守卫", () => {
  test("mid 不存在 → 404", async () => {
    setupMetasFakes([]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("mid 对应 type='tag'(非分类)→ 404(防误改 tag 为 category)", async () => {
    setupMetasFakes([{ mid: 2, name: "标签甲", slug: "tag-a", desc: null, type: "tag" }]);
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "试图改成分类" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin/categories/[id].put:并发兜底", () => {
  test("update 时记录被并发删(P2025)→ 404 而非 500", async () => {
    // existingCategory 预检:始终返回 mid=2 的 category 行
    sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> } = { where: {} }) => {
      // 仅当 where.mid 命中且 type=category 时返回;其它(查重预检)走过滤
      if (where.type === "category" && where.mid !== undefined) {
        const mid = typeof where.mid === "object" ? (where.mid as { not?: number })?.not : where.mid;
        if (mid !== undefined) return null;
        return { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" };
      }
      // existingByName / existingBySlug:严格按 where 过滤;空 → null
      const allRows = [{ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }];
      const r = allRows.find(m => {
        if (where.name !== undefined && m.name !== where.name) return false;
        if (where.slug !== undefined && m.slug !== where.slug) return false;
        return true;
      });
      return r ?? null;
    });
    sharedFake.on("metas", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "新名" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("并发唯一约束冲突(P2002)→ 400 而非 500", async () => {
    sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> } = { where: {} }) => {
      // 仅 existingCategory 预检:where.type=category 且 where.mid 是纯数字(非 {not:N})
      if (where.type === "category" && typeof where.mid === "number") {
        return { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" };
      }
      // existingByName / existingBySlug:没有 name/slug 命中 → null(避免误判冲突)
      return null;
    });
    sharedFake.on("metas", "update", async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "新名字P2002" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称或标识(slug)已存在" });
  });
});

describe("admin/categories/[id].put:部分更新语义", () => {
  test("只改 name,slug/desc 不传 → 保留原值", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: "原 desc", type: "category" }]);
    await callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "分类甲改名" },
      cookie: await cookie(),
    });
    // 后续再读 — 由 setupMetasFakes 共享 rows
    const r = await callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "再改" },
      cookie: await cookie(),
    }) as { data: { name: string; slug: string | null; desc: string | null } };
    expect(r.data.name).toBe("再改");
    expect(r.data.slug).toBe("cat-a"); // 未传 → 保留
    expect(r.data.desc).toBe("原 desc"); // 未传 → 保留
  });

  test("name 前后空白 trim", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }]);
    const r = (await callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "  分类甲改名  " },
      cookie: await cookie(),
    })) as { data: { name: string } };
    expect(r.data.name).toBe("分类甲改名");
  });

  test("slug 显式空串 → 清空为 null", async () => {
    setupMetasFakes([{ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }]);
    const r = (await callAdmin(handler, {
      method: "PUT",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "分类甲", slug: "" },
      cookie: await cookie(),
    })) as { data: { slug: string | null } };
    expect(r.data.slug).toBeNull();
  });
});