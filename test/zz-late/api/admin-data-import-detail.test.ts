/**
 * server/api/admin/data/import.post.ts 集成测:
 *  - 已有 admin-data-import.test.ts 覆盖 happy;本文件补 csrf / source 格式 / DB 异常
 *  - 入参是 multipart 的 source 字段(JSON 字符串),不是 body.data
 */
import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";
import { CSRF_COOKIE } from "#test/helpers/auth-fakes";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/data/import.post")).default;

async function authedCookie(): Promise<string> {
  const session = await loginSessionCookie();
  return `${session}; ${CSRF_COOKIE}`;
}

// 生成一份合法的最小 backup payload
function buildPayload(): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      contents: [{ cid: 1, title: "x", slug: "x", status: 1, type: 0 }],
      metas: [{ mid: 1, name: "A", slug: "a", type: "category" }],
      contentrelations: [{ cid: 1, mid: 1 }],
      comments: [],
      subscribes: [],
      subscribeposts: [],
      attachments: [],
      links: [],
      changelogs: [],
      travels: [],
      informations: [],
      contentattachments: [],
      contenttravels: [],
    },
  });
}

describe("admin/data/import.post(数据导入)", () => {
  test("未登录但 csrfToken 缺 → 403(CSRF check 在鉴权前)", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, source: buildPayload() },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("CSRF 失败 → 403", async () => {
    const session = await loginSessionCookie();
    const cookie = `${session}; csrf_token=wrong-token`;
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
      body: { csrfToken: CSRF_TOKEN, source: buildPayload() },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("source 缺 → 400 备份文件内容为空", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400, message: "备份文件内容为空" });
  });

  test("source 非字符串 → 400", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, source: { not: "string" } },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("source 是坏 JSON → 400 备份文件格式错误", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, source: "not-json{" },
    })).rejects.toMatchObject({ statusCode: 400, message: "备份文件格式错误，无法解析" });
  });

  test("source 超 50MB → 400 备份文件过大", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, source: "x".repeat(51 * 1024 * 1024) },
    })).rejects.toMatchObject({ statusCode: 400, message: "备份文件过大" });
  });

  // 完整成功路径(含 TRUNCATE + 13 表 createMany + 序列重置 + sessionStore 补回)
  // 在 admin-data-import.test.ts 已覆盖;本文件聚焦输入校验,不再重复事务集成
});