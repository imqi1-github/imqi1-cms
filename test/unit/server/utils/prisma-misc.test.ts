import { describe, expect, test } from "bun:test";

import { isPrismaNotFoundError } from "#server/utils/prisma";

describe("isPrismaNotFoundError", () => {
  test("PrismaClientKnownRequestError 风格(code='P2025') → true", () => {
    const err = new Error("Record not found") as Error & { code: string };
    err.code = "P2025";
    expect(isPrismaNotFoundError(err)).toBe(true);
  });

  test("其它 Prisma 错误码(P2002 唯一约束冲突)→ false", () => {
    const err = new Error("Unique constraint failed") as Error & { code: string };
    err.code = "P2002";
    expect(isPrismaNotFoundError(err)).toBe(false);
  });

  test("非 Error 类型(null/undefined/字符串/对象)→ false", () => {
    expect(isPrismaNotFoundError(null)).toBe(false);
    expect(isPrismaNotFoundError(undefined)).toBe(false);
    expect(isPrismaNotFoundError("P2025")).toBe(false);
    expect(isPrismaNotFoundError({ code: "P2025" })).toBe(false); // 非 Error 实例 → false
    expect(isPrismaNotFoundError(123)).toBe(false);
  });

  test("Error 实例但无 code 字段 → false", () => {
    expect(isPrismaNotFoundError(new Error("generic"))).toBe(false);
  });

  test("Error 实例 code 是非字符串(数字)→ false", () => {
    const err = new Error("x") as Error & { code: unknown };
    err.code = 2025;
    expect(isPrismaNotFoundError(err)).toBe(false);
  });
});