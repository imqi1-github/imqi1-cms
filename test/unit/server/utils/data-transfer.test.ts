import { describe, expect, test } from "bun:test";

import {
  DATA_TABLES,
  DATA_TRANSFER_VERSION,
  reviveRowsForImport,
} from "#server/utils/data-transfer";

describe("DATA_TRANSFER_VERSION", () => {
  test("导出当前版本号(导入端据此校验结构兼容)", () => {
    expect(DATA_TRANSFER_VERSION).toBe(1);
  });
});

describe("DATA_TABLES", () => {
  test("包含核心业务表", () => {
    const models = DATA_TABLES.map(t => t.model);
    expect(models).toContain("contents");
    expect(models).toContain("comments");
    expect(models).toContain("links");
    expect(models).toContain("changelogs");
    expect(models).toContain("subscribes");
  });

  test("不包含 users(密码/auth_code 不参与备份)", () => {
    const models = DATA_TABLES.map(t => t.model);
    expect(models).not.toContain("users");
  });

  test("不包含 sessions(临时会话)", () => {
    const models = DATA_TABLES.map(t => t.model);
    expect(models).not.toContain("sessions");
  });

  test("每个表项 model + dateFields 都是字符串数组", () => {
    for (const t of DATA_TABLES) {
      expect(typeof t.model).toBe("string");
      expect(Array.isArray(t.dateFields)).toBe(true);
      for (const f of t.dateFields) {
        expect(typeof f).toBe("string");
      }
    }
  });

  test("contents 有 create_time + update_time 双日期字段", () => {
    const contents = DATA_TABLES.find(t => t.model === "contents");
    expect(contents?.dateFields).toContain("create_time");
    expect(contents?.dateFields).toContain("update_time");
  });
});

describe("reviveRowsForImport", () => {
  test("dateFields 为空 → 原样返回(不做处理)", () => {
    const rows = [{ a: 1 }, { a: 2 }];
    expect(reviveRowsForImport(rows, [])).toEqual(rows);
  });

  test("合法 ISO 日期字符串 → 转 Date 对象", () => {
    const rows = [{ id: 1, create_time: "2024-01-01T00:00:00Z" }];
    const out = reviveRowsForImport(rows, ["create_time"]);
    expect(out[0]?.id).toBe(1);
    expect(out[0]?.create_time).toBeInstanceOf(Date);
    expect((out[0]?.create_time as Date).toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  test("非法日期字符串 → 字段置 undefined(交由 DB 默认值处理)", () => {
    const rows = [{ id: 1, create_time: "not-a-date" }];
    const out = reviveRowsForImport(rows, ["create_time"]);
    expect(out[0]?.create_time).toBeUndefined();
  });

  test("null/undefined 日期字段 → 保持 null/undefined(不转换)", () => {
    const rows = [
      { id: 1, create_time: null },
      { id: 2, create_time: undefined },
    ];
    const out = reviveRowsForImport(rows, ["create_time"]);
    expect(out[0]?.create_time).toBeNull();
    expect(out[1]?.create_time).toBeUndefined();
  });

  test("多个 dateFields 同时处理", () => {
    const rows = [{
      id: 1,
      create_time: "2024-01-01",
      update_time: "2024-12-31",
    }];
    const out = reviveRowsForImport(rows, ["create_time", "update_time"]);
    expect(out[0]?.create_time).toBeInstanceOf(Date);
    expect(out[0]?.update_time).toBeInstanceOf(Date);
  });

  test("不影响非 dateFields 字段", () => {
    const rows = [{ id: 1, title: "x", create_time: "2024-01-01" }];
    const out = reviveRowsForImport(rows, ["create_time"]);
    expect(out[0]?.id).toBe(1);
    expect(out[0]?.title).toBe("x");
  });

  test("不会修改原 row 对象(返回新对象)", () => {
    const rows = [{ id: 1, create_time: "2024-01-01" }];
    const snapshot = JSON.stringify(rows);
    reviveRowsForImport(rows, ["create_time"]);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});