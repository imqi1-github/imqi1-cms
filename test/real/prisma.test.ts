// 真实 prisma.ts 测试:该模块在其它所有测试里都被 mockSharedPrisma 替换,
// 只有先于全部 mock 注册加载(本目录)才能测到真实现。PrismaClient 构造不建连接,进程内安全。
import { describe, expect, test } from "bun:test";

const realPrisma = await import("#server/utils/prisma");

describe("prisma.ts 真实现", () => {
  test("default 与命名导出是同一 PrismaClient 实例", () => {
    expect(realPrisma.default).toBe(realPrisma.prisma);
    expect(typeof realPrisma.prisma.contents?.findMany).toBe("function");
  });

  test("isPrismaNotFoundError:仅 P2025 Error 判真,其余一律 false", () => {
    const { isPrismaNotFoundError } = realPrisma;
    expect(isPrismaNotFoundError(Object.assign(new Error("x"), { code: "P2025" }))).toBe(true);
    expect(isPrismaNotFoundError(Object.assign(new Error("x"), { code: "P2002" }))).toBe(false);
    expect(isPrismaNotFoundError(new Error("no code"))).toBe(false);
    expect(isPrismaNotFoundError("P2025")).toBe(false);
    expect(isPrismaNotFoundError(null)).toBe(false);
    expect(isPrismaNotFoundError(undefined)).toBe(false);
  });
});
