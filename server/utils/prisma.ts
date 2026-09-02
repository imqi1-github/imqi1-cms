import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// 运行时用拆分的 DB_* 变量拼 PG 连接串（与 prisma.config.ts 保持一致，避免单独维护 DATABASE_URL）。
// 云托管 PG 若走 SSL，可在 DB_* 之外设 DATABASE_URL 或拼接 ?sslmode=require。
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

export default prisma;
