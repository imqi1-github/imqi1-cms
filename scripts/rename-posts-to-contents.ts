import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(__dirname, "rename-posts-to-contents.sql");

/**
 * 执行 scripts/rename-posts-to-contents.sql：
 * 将 posts / postrelations / postattachments / posttravels 及其外键、索引
 * 彻底重命名为 contents / contentrelations / contentattachments / contenttravels。
 * subscribeposts 保持不变。
 *
 * SQL 本身幂等（全程用 information_schema 判断状态），可安全重复执行。
 * 建议在生产库执行前先做一次完整备份。
 */
async function main() {
  console.log("\n=== posts → contents 表重命名迁移 ===\n");

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

  const sql = readFileSync(SQL_FILE, "utf-8");

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  try {
    console.log(`→ 连接数据库 ${user}@${host}:${port}/${database}`);
    console.log("→ 执行 rename-posts-to-contents.sql（重命名表 + 外键 + 索引）...");

    await connection.query(sql);

    // 校验：新表是否就位、旧表是否已消失
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME IN ('posts','postrelations','postattachments','posttravels',
                            'contents','contentrelations','contentattachments','contenttravels')
       ORDER BY TABLE_NAME`,
      [database],
    );
    const names = rows.map(r => r.TABLE_NAME as string);
    const leftoverOld = names.filter(n => ["posts", "postrelations", "postattachments", "posttravels"].includes(n));

    console.log("\n当前相关表：", names.join(", ") || "（无）");
    if (leftoverOld.length > 0) {
      console.warn("⚠️  仍存在旧表：", leftoverOld.join(", "), "——请检查是否有新表已存在导致跳过。");
    } else {
      console.log("✅ 重命名完成：旧表已全部转为 content* 前缀，subscribeposts 保持不变。");
    }
  } catch (error) {
    console.error("\n❌ 迁移失败:", error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
