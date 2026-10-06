import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { PRISMA_NOT_FOUND_CODE } from "#shared/constants";

// 运行时用拆分的 DB_* 变量拼 PG 连接串（prisma.config.ts 里 Prisma CLI 也走同一套，
// 全站只有这一套数据库配置）。注意：运行时**不读** DATABASE_URL。
const connectionString = `postgresql://${encodeURIComponent(process.env.DB_USER || "postgres")}:${encodeURIComponent(
  process.env.DB_PASSWORD ?? "",
)}@${process.env.DB_HOST || "localhost"}:${Number(process.env.DB_PORT || 5432)}/${process.env.DB_NAME || ""}`;

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Prisma「记录不存在」(P2025) 判定：把「预检通过 → 提交前被并发删除」的竞态映射成 404 而非 500。
 *
 * 原写法（instanceof + "code" in error + 码比较）在 30 多个接口里各抄了一遍、彼此还略有出入，
 * 收在这里统一。传 catch 到的任意值即可，非 Error/无 code 一律返回 false。
 */
export function isPrismaNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === PRISMA_NOT_FOUND_CODE;
}

/**
 * Prisma「唯一约束冲突」(P2002) 判定：把「并发写入同一唯一键」映射成幂等/400 而非 500。
 *
 * **必须 duck-typing，不能 `instanceof PrismaClientKnownRequestError`**：Prisma 7 + driver adapter
 * 抛出的错误实例与 `@prisma/client/runtime/client` 导出的类是两份（模块实例不同），
 * instanceof 恒为 false，会把唯一约束冲突误判成未知 500（点赞幂等分支曾因此失效）。
 */
export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "P2002";
}

export default prisma;
