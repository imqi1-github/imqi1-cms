/**
 * 真实 DB 集成测的全局初始化(test/integration/real/* 共享):
 *  - 从项目根 .env 读 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME,任一缺失即抛
 *  - 默认测试库 = ${DB_NAME}_test(避免污染 dev 数据);TEST_DB_NAME 可覆盖
 *  - CREATE DATABASE IF NOT EXISTS(用 postgres 库探测 + CREATE)
 *  - 跑 init-db.sql(幂等:CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING)
 *  - 模块级预检 + 启动一次,后续测试通过 setupDb() 复用连接
 *
 * 设计原则:
 *  - .env 里没有 DB 配置 → 抛(用户强原则:让「配置缺失」立刻显形)
 *  - DB 连不通 → 抛(同上)
 *  - 库名后缀 _test 不被认作「测试专用隔离」(用户用 init-db.ts 时手动指定 DB_NAME 即可)
 *  - 测试隔离由 _helpers.ts 的 resetDb() 负责(TRUNCATE CASCADE + reseed admin)
 */
import { readFileSync } from "fs";
import { join } from "path";

import dotenv from "dotenv";
import pg from "pg";

import { findRepoRoot } from "#test/helpers/find-repo-root";

// bun:test 下 import.meta.path 不是 file:// URL,改用 import.meta.dirname
const ROOT = findRepoRoot(import.meta.dirname);
const SQL_FILE = join(ROOT, "scripts", "init-db.sql");

dotenv.config({ path: join(ROOT, ".env") });

function readEnv(): { host: string; port: number; user: string; password: string; db: string } {
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const explicitTestDb = process.env.TEST_DB_NAME;
  const baseDb = process.env.DB_NAME;
  if (!host || !user || !password || !baseDb) {
    throw new Error(
      "[test/integration/real] .env 缺少 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME 中的任一字段,拒绝静默用默认",
    );
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`[test/integration/real] DB_PORT 非法:${process.env.DB_PORT}`);
  }
  // 库名白名单(复用 init-db.ts 约束,防 SQL 注入 / 非法字符)
  const db = explicitTestDb || `${baseDb}_test`;
  if (!/^[A-Za-z0-9_-]+$/.test(db)) {
    throw new Error(`[test/integration/real] 测试库名含非法字符(仅字母数字下划线连字符):${db}`);
  }
  return { host, port, user, password, db };
}

let bootstrapped = false;
let cached: { host: string; port: number; user: string; password: string; db: string } | null = null;

/** 模块级幂等 bootstrap:测一次运行只执行一次(任何 test/integration/real/* 文件 import 即触发) */
export async function setupDb(): Promise<{ host: string; port: number; user: string; password: string; db: string }> {
  if (bootstrapped && cached) return cached;
  const cfg = readEnv();
  // 库可达性预检:连默认 postgres 库能通即可,缺失则建
  const admin = new pg.Client({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: "postgres" });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [cfg.db]);
    if ((exists.rowCount ?? 0) === 0) {
      await admin.query(
        `CREATE DATABASE "${cfg.db}" OWNER "${cfg.user}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
      );
    }
  } catch (err) {
    throw new Error(
      `[test/integration/real] DB 不可达或权限不足(${cfg.user}@${cfg.host}:${cfg.port}):${(err as Error).message}`,
      { cause: err },
    );
  } finally {
    await admin.end().catch(() => {});
  }

  // 目标库初始化(init-db.sql 幂等)
  // init-db.sql 在历史库上跑会因 CREATE TABLE 缺 IF NOT EXISTS 触发 42P07(table already exists)；
  // 测试库(imqi1_test)多次跑 setupDb 必然踩到。捕获这类错误当作成功跳过。
  const client = new pg.Client({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.db });
  await client.connect();
  try {
    await client.query(`ALTER DATABASE "${cfg.db}" SET timezone = 'UTC'`);
    await client.query("SET timezone = 'UTC'");
    try {
      await client.query(readFileSync(SQL_FILE, "utf-8"));
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // 42P07 = duplicate_table, 42710 = duplicate_object, 42P06 = duplicate_schema
      // 表/索引已存在 → 视为幂等成功（init-db.sql 没加 IF NOT EXISTS 时的兼容层）
      if (code === "42P07" || code === "42710" || code === "42P06") {
        console.warn(`[setup] 跳过 init-db.sql 中已存在的对象(${code}),视为幂等成功`);
      } else {
        throw err;
      }
    }
  } finally {
    await client.end();
  }

  bootstrapped = true;
  cached = cfg;
  return cfg;
}

/** 调试用:打印当前测试库连接信息(避免把密码打到日志里) */
export function describeDb(cfg: { host: string; port: number; user: string; db: string }): string {
  return `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.db}`;
}

/**
 * 各 test/integration/real/*.test.ts 顶部的「初始化」一行调用:
 *   await setupTestEnv();
 *   await import("#test/helpers/nitro-globals");
 *   const { ... } = await import("./_helpers");
 *   const handler = (await import("#server/api/...")).default;
 *
 * 副作用:
 *  - 跑一次 setupDb(幂等)
 *  - 改 process.env.DB_NAME = 测试库名,确保后续 import 触发的 server/utils/prisma
 *    模块加载按测试库 env 构造 adapter(否则 prisma 绑死在 dev DB,handler 全写错库)
 */
let envApplied = false;
export async function setupTestEnv(): Promise<{ host: string; port: number; user: string; password: string; db: string }> {
  if (envApplied) return (await setupDb());
  const cfg = await setupDb();
  process.env.DB_NAME = cfg.db;
  envApplied = true;
  return cfg;
}