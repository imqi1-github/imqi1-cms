import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

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
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
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

  // multipleStatements: 允许一次执行 init-db.sql 中的多条语句
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });
  // 目标库可能尚未创建：先建库再切库（全新 MySQL 上连接带 database 会抛 ER_BAD_DB_ERROR Unknown database）
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.changeUser({ database });

  try {
    console.log(`→ 连接数据库 ${user}@${host}:${port}/${database}`);
    console.log("→ 执行 init-db.sql（建表 + 默认设置 + 示例数据）...");

    await connection.query(sql);

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
    await connection.end();
  }
}

main();
