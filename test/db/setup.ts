/**
 * test/db/setup.ts: 真实 DB 测试基础设施
 *
 * 用真实 Postgres 连接（来自 .env）替代 mock-prisma 假件
 * 适用:
 *   - 需要验证 Prisma SQL 语法/外键约束/关系查询正确性
 *   - mock 测试漏掉的边界(并发竞态、unique 约束、cascade)
 *   - 需要真实 bcrypt/COS/MD5 加密路径的端到端测试
 *
 * 用法:
 *   import { db, cleanDb, seedAdmin } from "#test/db/setup";
 *
 *   beforeEach(async () => {
 *     await cleanDb(); // 清空业务表,保留 admin user(uid=1)
 *   });
 *
 * 约束:
 *   - 不并发跑(bun --max-concurrency=1 + 全局事务隔离已够测试用)
 *   - DB_NAME=imqi1 测试库(开发库同名,需谨慎:不要 init-db 重置)
 *   - 不放生产:DB_NAME/PASSWORD 走 .env,本机无则 skip 整组
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// 单实例避免连接池耗尽
const globalForDb = globalThis as unknown as { __db?: PrismaClient };
export const db: PrismaClient = globalForDb.__db ?? (() => {
  if (!process.env.DB_NAME) throw new Error("[test/db] DB_NAME 未配置,跳过真实 DB 测试");
  const connectionString = `postgresql://${encodeURIComponent(process.env.DB_USER || "postgres")}:${encodeURIComponent(
    process.env.DB_PASSWORD ?? "",
  )}@${process.env.DB_HOST || "localhost"}:${Number(process.env.DB_PORT || 5432)}/${process.env.DB_NAME || ""}`;
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });
  globalForDb.__db = client;
  return client;
})();

/**
 * 清理业务表(seed 的 admin 保留以保证 loginSessionCookie 可用)
 * 注意:contents/metas/users/sessions 等表按依赖顺序反向清理
 */
export async function cleanDb(): Promise<void> {
  // 多对多 / 子表先清(注意顺序:被外键引用的先删)
  await db.contenttravels.deleteMany({});
  await db.contentattachments.deleteMany({});
  await db.contentrelations.deleteMany({});
  await db.subscribeposts.deleteMany({});
  await db.trusted_devices.deleteMany({});
  await db.sessions.deleteMany({});
  // 主表
  await db.travels.deleteMany({});
  await db.attachments.deleteMany({});
  await db.changelogs.deleteMany({});
  await db.comments.deleteMany({});
  await db.links.deleteMany({});
  await db.subscribes.deleteMany({});
  await db.contents.deleteMany({});
  await db.metas.deleteMany({});
  await db.informations.deleteMany({ where: { key: { not: "sessionStoreType" } } });
  // users 保留 admin (uid=1) — loginSessionCookie 需要
  // 其他测试创建的 uid>1 用户一并清理,避免 name/mail 唯一约束污染后续用例
  await db.users.deleteMany({ where: { uid: { gt: 1 } } });
}

/**
 * 关闭连接(测试套件退出时调用)
 */
export async function disconnectDb(): Promise<void> {
  if (globalForDb.__db) await globalForDb.__db.$disconnect();
}

/**
 * 跳过本组:DB 未配置时(test 里 mock 或 dry-run)
 */
export function skipIfNoDb(): boolean {
  return !process.env.DB_NAME;
}