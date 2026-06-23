/**
 * 一次性迁移：changelogs.class + changelogs.desc → changelogs.content（JSON 条目列表）
 *
 * 新模型：去掉 class，desc 改名为 content；content 是 TEXT，存
 *   [{ "type": "功能"|"优化"|...|"其他", "value": "..." }, ...]
 *
 * 旧值映射（旧 class → 新条目 type）：
 *   新增→新增、优化→优化、修复→修复、删除→删除、重构→优化、
 *   feature→功能、improvement→优化、fix→修复，其余→其他
 *
 * 项目 DB 迁移历史与本地 prisma/migrations 脱节（实际靠 db push），
 * 因此不使用 prisma migrate，而是用原始 SQL 直接搬运数据。
 *
 * 幂等：
 *   - content 列不存在则新增（TEXT NULL）
 *   - content 仍为 NULL 的行按 class+desc 填充为单条目 JSON
 *   - content 改为 NOT NULL
 *   - class / desc 列若仍存在则删除
 *   - 已迁移完成（content 在、class 不在）则只打印现状
 *
 * 用法：
 *   tsx scripts/migrate-changelog-content.ts          # 检查模式（只读，打印现状）
 *   tsx scripts/migrate-changelog-content.ts --apply  # 实际执行
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
});

const prisma = new PrismaClient({ adapter });
const apply = process.argv.includes("--apply");

const raw = <T = any>(sql: string): Promise<T> => (prisma as any).$queryRawUnsafe(sql);
const exec = (sql: string): Promise<number> => (prisma as any).$executeRawUnsafe(sql);

async function tableExists(name: string): Promise<boolean> {
  const rows = await raw<any[]>(`SHOW TABLES LIKE '${name}'`);
  return rows.length > 0;
}

async function columnExists(table: string, col: string): Promise<boolean> {
  const rows = await raw<any[]>(`SHOW COLUMNS FROM \`${table}\``);
  return rows.some(r => r.Field === col);
}

// 旧 class → 新 type 的 SQL CASE 表达式片段
const TYPE_CASE = `CASE
  WHEN \`class\` = '新增' THEN JSON_ARRAY(JSON_OBJECT('type','新增','value',\`desc\`))
  WHEN \`class\` = '优化' THEN JSON_ARRAY(JSON_OBJECT('type','优化','value',\`desc\`))
  WHEN \`class\` = '修复' THEN JSON_ARRAY(JSON_OBJECT('type','修复','value',\`desc\`))
  WHEN \`class\` = '删除' THEN JSON_ARRAY(JSON_OBJECT('type','删除','value',\`desc\`))
  WHEN \`class\` = '重构' THEN JSON_ARRAY(JSON_OBJECT('type','优化','value',\`desc\`))
  WHEN \`class\` = 'feature' THEN JSON_ARRAY(JSON_OBJECT('type','功能','value',\`desc\`))
  WHEN \`class\` = 'improvement' THEN JSON_ARRAY(JSON_OBJECT('type','优化','value',\`desc\`))
  WHEN \`class\` = 'fix' THEN JSON_ARRAY(JSON_OBJECT('type','修复','value',\`desc\`))
  ELSE JSON_ARRAY(JSON_OBJECT('type','其他','value',\`desc\`))
END`;

async function run() {
  const log = (...a: any[]) => console.log(...a);

  const exists = await tableExists("changelogs");
  log("changelogs 表存在:", exists);
  if (!exists) {
    log("没有 changelogs 表，无需迁移。");
    return;
  }

  const hasContent = await columnExists("changelogs", "content");
  const hasClass = await columnExists("changelogs", "class");
  const hasDesc = await columnExists("changelogs", "desc");
  log(`列现状 -> content: ${hasContent} | class: ${hasClass} | desc: ${hasDesc}`);

  const totalRow = await raw<any[]>(`SELECT COUNT(*) AS c FROM changelogs`);
  const total = Number(totalRow[0]?.c ?? 0);
  log("changelogs 行数:", total);

  // 已迁移完成
  if (hasContent && !hasClass && !hasDesc) {
    log("\n✅ 已是目标结构（content 在，class/desc 已删），无需操作。");
    return;
  }

  if (!apply) {
    log("\n[dry-run] 未传 --apply，仅检查。确认无误后用 --apply 执行。");
    return;
  }

  console.log("\n== 开始执行 ==");

  // 1. 新增 content 列
  if (!hasContent) {
    await exec(`ALTER TABLE \`changelogs\` ADD COLUMN \`content\` TEXT NULL`);
    log("已新增 content 列（TEXT NULL）");
  } else {
    log("content 列已存在，跳过新增");
  }

  // 2. 用 class + desc 填充 content（仅 content 为 NULL 的行）
  if (hasClass && hasDesc) {
    const filled = await exec(
      `UPDATE \`changelogs\` SET \`content\` = ${TYPE_CASE} WHERE \`content\` IS NULL`,
    );
    log(`已填充 ${filled} 行的 content`);
  } else {
    log("class/desc 已不存在，跳过数据填充（可能已部分迁移）");
  }

  // 3. content 改为 NOT NULL
  await exec(`ALTER TABLE \`changelogs\` MODIFY COLUMN \`content\` TEXT NOT NULL`);
  log("已将 content 改为 NOT NULL");

  // 4. 删除 class / desc
  if (hasClass) {
    await exec(`ALTER TABLE \`changelogs\` DROP COLUMN \`class\``);
    log("已删除 class 列");
  }
  if (hasDesc) {
    await exec(`ALTER TABLE \`changelogs\` DROP COLUMN \`desc\``);
    log("已删除 desc 列");
  }

  const verifyRow = await raw<any[]>(`SELECT COUNT(*) AS c FROM changelogs`);
  log(`\n== 完成 | changelogs 现有 ${Number(verifyRow[0]?.c ?? 0)} 行 ==`);
}

run()
  .catch(e => {
    console.error("迁移失败:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
