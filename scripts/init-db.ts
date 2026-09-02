import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import pg from "pg";
import * as dotenv from "dotenv";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(__dirname, "init-db.sql");

// 固定加载项目根的 .env（脚本可能从任意 cwd 运行，勿依赖 dotenv 默认的 cwd 查找）
dotenv.config({ path: join(__dirname, "..", ".env") });

/**
 * 执行 scripts/init-db.sql，完成建表 + 写入默认设置 + 插入示例数据。
 *
 * SQL 本身是幂等的（CREATE TABLE IF NOT EXISTS + ON DUPLICATE KEY UPDATE），
 * 因此本脚本在开发/生产环境均可安全重复执行。生产环境也可跳过本脚本，
 * 直接在数据库管理工具中导入 init-db.sql。
 */
async function main() {
  console.log("\n=== ImQi1 CMS 数据库初始化 ===\n");

  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USER || "postgres";
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!password || !database) {
    console.error("❌ 缺少数据库配置：请在 .env 中设置 DB_PASSWORD 与 DB_NAME（参考 .env.example）。");
    process.exitCode = 1;
    return;
  }

  // 库名会拼进反引号标识符，仅允许安全字符（字母数字下划线连字符），防止注入 / 非法库名
  if (!/^[A-Za-z0-9_-]+$/.test(database)) {
    console.error("❌ 数据库名含非法字符，仅允许字母数字下划线连字符：" + database);
    process.exitCode = 1;
    return;
  }

  const sql = readFileSync(SQL_FILE, "utf-8");

  // pg 的 Client.query 对无参数 SQL 走简单查询协议，可一次执行多语句（init-db.sql 含多条 DDL）
  // PG 无 `CREATE DATABASE IF NOT EXISTS`：先连默认 postgres 库探测，缺失再建。
  const adminClient = new Client({ host, port, user, password, database: "postgres" });
  await adminClient.connect();
  const exists = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if ((exists.rowCount ?? 0) === 0) {
    // 库名已在上方校验为安全字符（字母数字下划线连字符），引号包裹防大小写/连字符问题。
    // 显式 ENCODING/LOCALE/TEMPLATE：避免依赖 PG 服务器 default，保证中文 + UTF8 + C collation 一致，
    // 后续 varchar 排序/索引与服务器 TZ/locale 设置解耦。
    await adminClient.query(
      `CREATE DATABASE "${database}" OWNER "${user}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
    );
  }
  await adminClient.end();

  // 目标库连接执行 SQL
  const client = new Client({ host, port, user, password, database });
  await client.connect();

  try {
    console.log(`→ 连接数据库 ${user}@${host}:${port}/${database}`);

    // 强制该库默认 timezone 为 UTC：避免服务器时区（如东八区）与 Prisma 写入的 UTC Date 字面值混用，
    // 导致 CREATE TABLE ... DEFAULT CURRENT_TIMESTAMP 与 create_time 写入存在时区差，
    // 进而让归档分组（archiving.get.ts 用 getUTC*）与按时间排序的搜索结果跨区错位。
    // ALTER DATABASE ... SET 影响该库后续新建会话；本连接也立即 SET timezone='UTC' 兜底当前会话。
    // PG 不允许 ALTER DATABASE 后跟函数（库名需字面量），这里用插值；库名已在上方白名单校验。
    await client.query(`ALTER DATABASE "${database}" SET timezone = 'UTC'`);
    await client.query("SET timezone = 'UTC'");

    console.log("→ 执行 init-db.sql（建表 + 默认设置 + 示例数据）...");
    await client.query(sql);

    console.log("\n✅ 初始化完成！");
    console.log("   已创建全部数据表与站点默认设置。");
    console.log("   示例数据：1 篇文章、1 个分类、1 条评论。");
    console.log("\n默认管理员账户：");
    console.log("   用户名: admin");
    console.log("   密码:   123456");
    console.log("   邮箱:   example@example.com");
    console.log("\n⚠️  登录后请立即在后台「账户设置」中修改密码。\n");
  } catch (error) {
    console.error("\n❌ 初始化失败:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
