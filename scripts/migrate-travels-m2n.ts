/**
 * 一次性迁移：travels.cid（一对多） → posttravels 关联表（多对多）
 *
 * 项目 DB 迁移历史与本地 prisma/migrations 脱节（实际靠 db push），
 * 因此不使用 prisma migrate，而是用原始 SQL 直接搬运数据。
 *
 * 幂等：
 *   - posttravels 不存在则按 schema 结构创建（含索引与外键）
 *   - travels.cid 还在则把数据搬进 posttravels，再删除 cid 列及其外键/索引
 *   - 已迁移完成则只打印现状，不重复执行
 *
 * 用法：
 *   tsx scripts/migrate-travels-m2n.ts          # 检查模式（只读，打印现状）
 *   tsx scripts/migrate-travels-m2n.ts --apply  # 实际执行
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

async function fkNamesOn(table: string, col: string): Promise<string[]> {
  const rows = await raw<any[]>(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${table}'
      AND COLUMN_NAME = '${col}'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  return rows.map(r => r.CONSTRAINT_NAME).filter(Boolean);
}

async function indexNamesOn(table: string, col: string): Promise<string[]> {
  const rows = await raw<any[]>(`SHOW INDEX FROM \`${table}\` WHERE Column_name = '${col}'`);
  return rows.map(r => r.Key_name).filter(n => n && n !== "PRIMARY");
}

async function run() {
  const log = (...a: any[]) => console.log(...a);
  const travelsExists = await tableExists("travels");
  log("travels 表存在:", travelsExists);
  if (!travelsExists) {
    log("没有 travels 表，无需迁移。");
    return;
  }

  const cidExists = await columnExists("travels", "cid");
  const totalRow = await raw<any[]>(`SELECT COUNT(*) AS c FROM travels`);
  const total = Number(totalRow[0]?.c ?? 0);
  let withCid = 0;
  if (cidExists) {
    const r = await raw<any[]>(`SELECT COUNT(*) AS c FROM travels WHERE cid IS NOT NULL`);
    withCid = Number(r[0]?.c ?? 0);
  }
  log(`travels 行数: ${total} | cid 列存在: ${cidExists} | cid 非空行数: ${withCid}`);

  const ptExists = await tableExists("posttravels");
  log("posttravels 表存在:", ptExists);

  if (!apply) {
    log("\n[dry-run] 未传 --apply，仅检查。确认无误后用 --apply 执行。");
    return;
  }

  console.log("\n== 开始执行 ==");

  // 1. 建关联表（匹配 prisma/schema.prisma 的 posttravels 结构）
  if (!ptExists) {
    await exec(`
      CREATE TABLE \`posttravels\` (
        \`travel_id\` INTEGER NOT NULL,
        \`cid\` INTEGER NOT NULL,
        PRIMARY KEY (\`travel_id\`, \`cid\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await exec(`CREATE INDEX \`PostTravels_travel_id_fkey\` ON \`posttravels\`(\`travel_id\`)`);
    await exec(`CREATE INDEX \`PostTravels_cid_fkey\` ON \`posttravels\`(\`cid\`)`);
    await exec(`ALTER TABLE \`posttravels\` ADD CONSTRAINT \`PostTravels_travel_id_fkey\` FOREIGN KEY (\`travel_id\`) REFERENCES \`travels\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    await exec(`ALTER TABLE \`posttravels\` ADD CONSTRAINT \`PostTravels_cid_fkey\` FOREIGN KEY (\`cid\`) REFERENCES \`posts\`(\`cid\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    log("已创建 posttravels 表（含索引与外键）");
  } else {
    log("posttravels 已存在，跳过建表");
  }

  // 2. 搬运 cid 数据并删除 travels.cid
  if (cidExists) {
    const inserted = await exec(`INSERT IGNORE INTO \`posttravels\` (\`travel_id\`, \`cid\`) SELECT \`id\`, \`cid\` FROM \`travels\` WHERE \`cid\` IS NOT NULL`);
    log(`已搬运 ${inserted} 条 cid → posttravels`);

    const fks = await fkNamesOn("travels", "cid");
    for (const fk of fks) {
      await exec(`ALTER TABLE \`travels\` DROP FOREIGN KEY \`${fk}\``);
      log(`已删除外键 ${fk}`);
    }
    const idxs = await indexNamesOn("travels", "cid");
    for (const ix of idxs) {
      try {
        await exec(`DROP INDEX \`${ix}\` ON \`travels\``);
        log(`已删除索引 ${ix}`);
      } catch (e: any) {
        log(`跳过索引 ${ix}（${e?.message || e}）`);
      }
    }
    await exec(`ALTER TABLE \`travels\` DROP COLUMN \`cid\``);
    log("已删除 travels.cid 列");
  } else {
    log("travels.cid 已不存在，跳过数据搬运");
  }

  const verifyRow = await raw<any[]>(`SELECT COUNT(*) AS c FROM posttravels`);
  log(`\n== 完成 | posttravels 现有 ${Number(verifyRow[0]?.c ?? 0)} 条关联 ==`);
}

run()
  .catch(e => {
    console.error("迁移失败:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
