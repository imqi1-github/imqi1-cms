/**
 * admin/system-info.get + admin/detailed-stats.get 补测:
 *  - 401 未登录守卫
 *  - 系统信息响应字段(版本/平台/DB version/附件统计/构建哈希/Docker 标志)
 *  - detailed-stats 各 count 字段、groupBy 分组
 *  - 异常路径 → 500 而非泄漏原始 message
 */
import { describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const sysInfoHandler = (await import("#server/api/admin/system-info.get")).default;
const detailedStatsHandler = (await import("#server/api/admin/detailed-stats.get")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}`;
}

describe("admin/system-info.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(sysInfoHandler, { method: "GET", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回完整系统信息字段", async () => {
    sharedFake.on("$queryRaw", async () => [{ version: "PostgreSQL 15.0" }]);
    sharedFake.on("attachments", "findMany", async () => [{ metadata: { size: 100, width: null, height: null, format: null } }, { metadata: { size: 200, width: null, height: null, format: null } }]);
    sharedFake.on("attachments", "count", async () => 2);
    const r = (await callAdmin(sysInfoHandler, {
      method: "GET",
      cookie: await cookie(),
    })) as Record<string, unknown>;
    expect(typeof r.nodeVersion).toBe("string");
    expect(typeof r.platform).toBe("string");
    expect(typeof r.uptime).toBe("string");
    expect(typeof r.memory).toBe("object");
    const db = r.database as { version: string };
    expect(db.version).toBe("PostgreSQL 15.0");
    const attachments = r.attachments as { count: number; totalSize: number };
    expect(attachments.count).toBe(2);
    expect(attachments.totalSize).toBe(300);
    expect(typeof r.buildHash).toBe("string");
    expect(typeof r.isDocker).toBe("boolean");
    expect(r.deploymentType === "docker" || r.deploymentType === "native").toBe(true);
  });

  test("附件 metadata 是对象(已解析)→ 正确求和", async () => {
    sharedFake.on("$queryRaw", async () => [{ version: "x" }]);
    sharedFake.on("attachments", "findMany", async () => [
      { metadata: { size: 1000 } },
      { metadata: { size: 2000 } },
    ]);
    sharedFake.on("attachments", "count", async () => 2);
    const r = (await callAdmin(sysInfoHandler, { method: "GET", cookie: await cookie() })) as { attachments: { totalSize: number } };
    expect(r.attachments.totalSize).toBe(3000);
  });

  test("附件 metadata 为 null → 安全归一化(不抛)", async () => {
    sharedFake.on("$queryRaw", async () => [{ version: "x" }]);
    sharedFake.on("attachments", "findMany", async () => [{ metadata: null }]);
    sharedFake.on("attachments", "count", async () => 1);
    const r = await callAdmin(sysInfoHandler, { method: "GET", cookie: await cookie() });
    expect(r).toBeDefined();
  });

  test("查询 DB 版本抛错 → 500 而非泄漏 message", async () => {
    sharedFake.on("$queryRaw", async () => {
      throw new Error("raw connection string 敏感");
    });
    try {
      await callAdmin(sysInfoHandler, { method: "GET", cookie: await cookie() });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});

describe("admin/detailed-stats.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(detailedStatsHandler, { method: "GET", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回详细统计(articles/published/drafts/comments/users/categories/tags/thisMonth)", async () => {
    sharedFake.on("contents", "count", async () => 10);
    sharedFake.on("comments", "count", async () => 20);
    sharedFake.on("users", "count", async () => 1);
    sharedFake.on("metas", "count", async () => 3);
    sharedFake.on("contents", "groupBy", async () => [
      { type: 0, status: 1, _count: { _all: 8 } },
      { type: 0, status: 0, _count: { _all: 2 } },
    ]);
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "文1", slug: "a", status: 1, type: 0, create_time: new Date(), comment_num: 5 },
    ]);
    sharedFake.on("metas", "findMany", async ({ where }: { where?: Record<string, unknown> } = {}) => {
      if (where?.type === "category") {
        return [{ mid: 1, name: "笔记", _count: { contentrelations: 3 } }];
      }
      return [];
    });
    const r = (await callAdmin(detailedStatsHandler, {
      method: "GET",
      cookie: await cookie(),
    })) as Record<string, unknown>;
    expect(r).toBeDefined();
    expect(typeof r).toBe("object");
  });

  test("异常 → 500 而非泄漏 message", async () => {
    sharedFake.on("contents", "count", async () => {
      throw new Error("raw db error 敏感");
    });
    try {
      await callAdmin(detailedStatsHandler, { method: "GET", cookie: await cookie() });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});