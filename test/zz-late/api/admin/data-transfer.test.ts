import "#test/helpers/nitro-globals";

import type { Readable } from "node:stream";

import { beforeEach, describe, expect, test } from "bun:test";

import { DATA_TABLES, DATA_TRANSFER_VERSION } from "#server/utils/data-transfer";
import { CSRF_COOKIE, CSRF_TOKEN, adminEvent, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== 各表假数据(导出/导入共用) =====
const exportRows: Record<string, unknown[]> = {};
for (const spec of DATA_TABLES) {
  sharedFake.on(spec.model, "findMany", async () => (exportRows[spec.model] ?? []).map(r => structuredClone(r)));
}

const createManyCalls: Array<{ model: string; data: Array<Record<string, unknown>> }> = [];
let informationsCreateFails = false;
for (const spec of DATA_TABLES) {
  sharedFake.on(spec.model, "createMany", async ({ data }: { data: Array<Record<string, unknown>> }) => {
    // informations 才有种子行:空表在导入时直接跳过、不会调 createMany
    if (spec.model === "informations" && informationsCreateFails) throw new Error("boom mid-import");
    createManyCalls.push({ model: spec.model, data: structuredClone(data) });
    return { count: data.length };
  });
}
const rawSql: string[] = [];
let informationsRestored: { key: string; value: string } | null = null;
// sessionStoreType 读取易被其它文件的 informations.findUnique 注册覆盖,本文件自带一份
sharedFake.on("informations", "findUnique", ({ where }: { where: { key: string } }) => {
  if (where.key === "sessionStoreType") return { value: "memory" };
  return null;
});
sharedFake.on("$executeRawUnsafe", async (sql: string) => {
  rawSql.push(sql);
  return { count: 0 };
});
sharedFake.on("informations", "create", async ({ data }: { data: { key: string; value: string } }) => {
  informationsRestored = { ...data };
  return data;
});

const exportHandler = (await import("#server/api/admin/data/export.get")).default;
const importHandler = (await import("#server/api/admin/data/import.post")).default;

async function sessionCookie() {
  return loginSessionCookie();
}

beforeEach(() => {
  for (const k of Object.keys(exportRows)) exportRows[k] = [];
  exportRows.contents = [{ cid: 1, title: "文一", slug: "a", type: 0, status: 1, create_time: "2026-01-01T00:00:00.000Z", update_time: "2026-01-02T00:00:00.000Z" }];
  exportRows.informations = [
    { id: 1, key: "siteName", value: "测试站" },
    { id: 2, key: "smtpPass", value: "mail-secret" },
    { id: 3, key: "sessionStoreType", value: "file" },
  ];
  createManyCalls.length = 0;
  rawSql.length = 0;
  informationsRestored = null;
  informationsCreateFails = false;
});

describe("admin/data/export(流式导出)", () => {
  test("未登录 401", async () => {
    await expect(exportHandler(adminEvent({ method: "GET" }) as never)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("JSON 分块流:version/表齐全/行保留/下载头", async () => {
    const event = adminEvent({ method: "GET", cookie: await sessionCookie() }) as unknown as { node: { res: { _data?: Readable } } };
    await exportHandler(event as never);
    const stream = event.node.res._data!;
    expect(stream).toBeTruthy();
    const chunks: string[] = [];
    for await (const c of stream) chunks.push(String(c));
    const payload = JSON.parse(chunks.join("")) as {
      version: number;
      exportedAt: string;
      tables: Record<string, unknown[]>;
    };
    expect(payload.version).toBe(DATA_TRANSFER_VERSION);
    expect(typeof payload.exportedAt).toBe("string");
    // 13 张表全部出现(空表是合法的 [])
    expect(Object.keys(payload.tables).sort()).toEqual(DATA_TABLES.map(s => s.model).sort());
    expect((payload.tables.contents as Array<{ cid: number }>)[0]!.cid).toBe(1);
    // 密钥原样落盘(完整备份需要真实值,文件本身须妥善保管)
    expect((payload.tables.informations as Array<{ value: string }>).some(r => r.value === "mail-secret")).toBe(true);
  });
});

describe("admin/data/import(整站还原)", () => {
  const buildSource = (over: Record<string, unknown> = {}) => {
    const tables: Record<string, unknown[]> = {};
    for (const spec of DATA_TABLES) tables[spec.model] = exportRows[spec.model] ?? [];
    return JSON.stringify({ version: DATA_TRANSFER_VERSION, exportedAt: "2026-09-26T00:00:00.000Z", tables, ...over });
  };

  test("CSRF 优先于登录校验:无 token 403;token 有效未登录 401", async () => {
    await expect(importHandler(adminEvent({ method: "POST", body: { source: "x" } }) as never)).rejects.toMatchObject({ statusCode: 403 });
    await expect(importHandler(adminEvent({ method: "POST", cookie: CSRF_COOKIE, body: { csrfToken: CSRF_TOKEN, source: "x" } }) as never)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("空内容/坏 JSON/结构缺失/版本不符/缺表 → 400", async () => {
    const cookie = `${await sessionCookie()}; ${CSRF_COOKIE}`;
    const call = (body: Record<string, unknown>) => importHandler(adminEvent({ method: "POST", cookie, body: { csrfToken: CSRF_TOKEN, ...body } }) as never);
    await expect(call({ source: "  " })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ source: "{not-json" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ source: JSON.stringify([1, 2]) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call({ source: JSON.stringify({ version: 999, tables: {} }) })).rejects.toMatchObject({ statusCode: 400 });
    const missingTable = JSON.parse(buildSource()) as { tables: Record<string, unknown> };
    delete missingTable.tables.comments;
    await expect(call({ source: JSON.stringify(missingTable) })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("整站还原:TRUNCATE + 逐表 createMany + 序列重置 + sessionStoreType 保留本机值", async () => {
    const cookie = `${await sessionCookie()}; ${CSRF_COOKIE}`;
    const r = (await importHandler(adminEvent({ method: "POST", cookie, body: { csrfToken: CSRF_TOKEN, source: buildSource() } }) as never)) as unknown as {
      success: boolean;
      total: number;
      tables: Record<string, number>;
    };
    expect(r.success).toBe(true);
    expect(r.tables.contents).toBe(1);
    expect(r.tables.informations).toBe(2); // sessionStoreType 被剔除
    expect(r.total).toBe(3);

    // TRUNCATE 覆盖全部表
    expect(rawSql[0]).toContain("TRUNCATE TABLE");
    for (const spec of DATA_TABLES) expect(rawSql[0]).toContain(`"${spec.model}"`);
    // 10 张自增主键表 setval
    expect(rawSql.filter(s => s.includes("setval"))).toHaveLength(10);
    // 日期字段已 revive 成 Date
    const contentsCall = createManyCalls.find(c => c.model === "contents")!;
    expect(contentsCall.data[0]!.create_time).toBeInstanceOf(Date);
    // 备份里的 sessionStoreType(file)不覆盖本机(memory),导入后补回本机原值
    expect(createManyCalls.find(c => c.model === "informations")!.data.some(row => row.key === "sessionStoreType")).toBe(false);
    expect(informationsRestored).toEqual({ key: "sessionStoreType", value: "memory" });
  });

  test("中途失败 → 500 已回滚文案", async () => {
    informationsCreateFails = true;
    const cookie = `${await sessionCookie()}; ${CSRF_COOKIE}`;
    await expect(importHandler(adminEvent({ method: "POST", cookie, body: { csrfToken: CSRF_TOKEN, source: buildSource() } }) as never)).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining("已回滚"),
    });
  });
});
