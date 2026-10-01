/**
 * 真实 DB 集成测 —— admin/categories/create.post
 * 走真 PrismaClient(指向 ${DB_NAME}_test),逐测试 TRUNCATE 后 reseed admin。
 * 关键顺序:setupDb → 改 DB_NAME env → 再 import handler(handler 的 server/utils/prisma
 * 在 import 时按当前 env 构造 adapter,必须确保 env 已是测试库名)
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

import { CSRF_HEADER } from "#shared/constants";


// CSRF_TOKEN 测试内字面量定义(auth-fakes 里也有,但 import 它会触发 mockSharedPrisma
// 污染真实 prisma;这里 inline 一份避免依赖)
const CSRF_TOKEN = "test-csrf-token-1234567890";

// 初始化顺序:setupTestEnv(改 DB_NAME)→ nitro-globals → helpers → handler
// 任何会触发 server/utils/prisma 模块加载的 import 都必须在 setupTestEnv 之后
await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, callDbAdmin, loginDbCookie } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
void registerDbReset;
const handler = (await import("#server/api/admin/categories/create.post")).default;

describe("admin/categories/create.post(真实 DB)", () => {
  registerDbReset();
  test("成功 → 写入 metas 表 + 返回白名单字段", async () => {
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "POST",
      url: "/api/admin/categories/create",
      cookie,
      body: { csrfToken: CSRF_TOKEN, name: "笔记", slug: "notes", desc: "技术笔记" },
    }) as { success: boolean; data: { mid: number; name: string; slug: string; desc: string | null } };

    expect(r.success).toBe(true);
    expect(r.data.name).toBe("笔记");
    expect(r.data.slug).toBe("notes");
    expect(r.data.desc).toBe("技术笔记");
    expect(r.data.mid).toBeGreaterThan(0);

    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: r.data.mid } });
    expect(row).not.toBeNull();
    expect(row!.type).toBe("category");
    expect(row!.name).toBe("笔记");
    expect(row!.slug).toBe("notes");
  });

  test("name 空 → 400 + DB 无写入", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "  ", slug: "x" },
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称不能为空" });

    const db = await getDb();
    expect(await db.metas.count({ where: { type: "category" } })).toBe(0);
  });

  test("name 非字符串 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: 123, slug: "x" },
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称格式错误" });
  });

  test("slug 已被占 → 400 分类标识已存在", async () => {
    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "A", slug: "dup" },
    });
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "B", slug: "dup" },
    })).rejects.toMatchObject({ statusCode: 400, message: "分类标识已存在" });
  });

  test("name 已被占 → 400 分类名称已存在", async () => {
    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "dup-name" },
    });
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "dup-name", slug: "other" },
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称已存在" });
  });

  test("slug 缺省 → 自动置 null + DB 中为 null", async () => {
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "无 slug" },
    }) as { data: { mid: number; slug: string | null } };
    expect(r.data.slug).toBeNull();

    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: r.data.mid } });
    expect(row!.slug).toBeNull();
  });

  test("CSRF 失败 → 403 + DB 无写入", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: "wrong", name: "x" },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    expect(await db.metas.count({ where: { type: "category" } })).toBe(0);
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create",
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("name 超 191 字符 → 400(列长上限,validateMetaData 拦截)", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/categories/create", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "x".repeat(192) },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  // 验证 CSRF_HEADER 常量值正确(防回归)
  test("CSRF_HEADER === x-csrf-token", () => {
    expect(CSRF_HEADER).toBe("x-csrf-token");
  });
});