import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: 10,
});

const prisma = new PrismaClient({ adapter });

type CountRow = { count: number | bigint };

async function countBySql(sql: string, ...values: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql, ...values);
  return Number(rows[0]?.count ?? 0);
}

async function tableExists(tableName: string) {
  const count = await countBySql(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    tableName,
  );
  return count > 0;
}

async function columnExists(tableName: string, columnName: string) {
  const count = await countBySql(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    tableName,
    columnName,
  );
  return count > 0;
}

async function indexExists(tableName: string, indexName: string) {
  const count = await countBySql(
    "SELECT COUNT(*) AS count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    tableName,
    indexName,
  );
  return count > 0;
}

async function constraintExists(tableName: string, constraintName: string) {
  const count = await countBySql(
    "SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?",
    tableName,
    constraintName,
  );
  return count > 0;
}

async function ensurePostAttachmentsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`postattachments\` (
      \`aid\` INTEGER NOT NULL,
      \`cid\` INTEGER NOT NULL,
      PRIMARY KEY (\`aid\`, \`cid\`),
      INDEX \`PostAttachments_aid_fkey\` (\`aid\`),
      INDEX \`PostAttachments_cid_fkey\` (\`cid\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log("✓ postattachments table is ready");
}

async function backfillExistingRelations() {
  const hasCid = await columnExists("attachments", "cid");
  if (!hasCid) {
    console.log("- attachments.cid already removed, skip backfill");
    return;
  }

  const before = await countBySql("SELECT COUNT(*) AS count FROM postattachments");
  await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO \`postattachments\` (\`aid\`, \`cid\`)
    SELECT \`aid\`, \`cid\` FROM \`attachments\`
  `);
  const after = await countBySql("SELECT COUNT(*) AS count FROM postattachments");
  console.log(`✓ backfilled ${after - before} attachment relation(s)`);
}

async function ensureForeignKeys() {
  const hasAidFk = await constraintExists("postattachments", "PostAttachments_aid_fkey");
  if (!hasAidFk) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`postattachments\`
      ADD CONSTRAINT \`PostAttachments_aid_fkey\`
      FOREIGN KEY (\`aid\`) REFERENCES \`attachments\`(\`aid\`)
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log("✓ added PostAttachments_aid_fkey");
  } else {
    console.log("- PostAttachments_aid_fkey already exists");
  }

  const hasCidFk = await constraintExists("postattachments", "PostAttachments_cid_fkey");
  if (!hasCidFk) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`postattachments\`
      ADD CONSTRAINT \`PostAttachments_cid_fkey\`
      FOREIGN KEY (\`cid\`) REFERENCES \`posts\`(\`cid\`)
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log("✓ added PostAttachments_cid_fkey");
  } else {
    console.log("- PostAttachments_cid_fkey already exists");
  }
}

async function dropLegacyCidColumn() {
  const hasCid = await columnExists("attachments", "cid");
  if (!hasCid) {
    console.log("- attachments.cid already removed");
    return;
  }

  const hasLegacyFk = await constraintExists("attachments", "Attachment_cid_fkey");
  if (hasLegacyFk) {
    await prisma.$executeRawUnsafe("ALTER TABLE `attachments` DROP FOREIGN KEY `Attachment_cid_fkey`");
    console.log("✓ dropped Attachment_cid_fkey");
  } else {
    console.log("- Attachment_cid_fkey does not exist");
  }

  const hasLegacyIndex = await indexExists("attachments", "Attachment_cid_fkey");
  if (hasLegacyIndex) {
    await prisma.$executeRawUnsafe("ALTER TABLE `attachments` DROP INDEX `Attachment_cid_fkey`");
    console.log("✓ dropped legacy Attachment_cid_fkey index");
  } else {
    console.log("- legacy Attachment_cid_fkey index does not exist");
  }

  await prisma.$executeRawUnsafe("ALTER TABLE `attachments` DROP COLUMN `cid`");
  console.log("✓ dropped attachments.cid");
}

async function main() {
  console.log("\n=== Migrate attachments to many-to-many post relation ===\n");

  if (!(await tableExists("attachments")) || !(await tableExists("posts"))) {
    throw new Error("attachments/posts table not found; aborting");
  }

  await ensurePostAttachmentsTable();
  await backfillExistingRelations();
  await ensureForeignKeys();
  await dropLegacyCidColumn();

  const relationCount = await countBySql("SELECT COUNT(*) AS count FROM postattachments");
  const hasLegacyCid = await columnExists("attachments", "cid");
  console.log(`\n✅ Done. postattachments rows: ${relationCount}; attachments.cid exists: ${hasLegacyCid ? "yes" : "no"}\n`);
}

main()
  .catch(error => {
    console.error("\n❌ Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
