import * as readline from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";

// 固定加载项目根的 .env（脚本可能从任意 cwd 运行，勿依赖 dotenv 默认的 cwd 查找）
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_PASSWORD) {
  console.error("❌ 缺少数据库配置 DB_PASSWORD，请检查 .env");
  process.exit(1);
}
if (!DB_NAME) {
  console.error("❌ 缺少数据库配置 DB_NAME，请检查 .env");
  process.exit(1);
}

const connectionString = `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * 两步验证重置工具（简易版）：
 * 当丢失认证器、无法完成 2FA 登录而被锁在门外时，运行 `bun run reset:2fa`，
 * 清除全部用户的 totp_enabled / totp_secret（本博客单用户），随后即可用密码正常登录，
 * 再在后台重新启用两步验证。
 *
 * 只动 2FA 相关列，不影响密码 / 会话 / auth_code。
 */
async function main() {
  console.log("\n=== 两步验证重置工具 ===\n");

  try {
    // 确认操作（避免误触，但不要求输入用户名/密码，保持极简）
    const confirm = await question("确认清除全部用户的两步验证吗？(恢复用，之后可重新启用) [y/N]: ");

    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("\n操作已取消");
      return;
    }

    const result = await prisma.users.updateMany({
      where: { totp_enabled: true },
      data: { totp_enabled: false, totp_secret: null },
    });

    // 已禁用但残留 secret 的用户也一并清掉（保证彻底干净）
    if (result.count === 0) {
      await prisma.users.updateMany({
        where: { totp_secret: { not: null } },
        data: { totp_enabled: false, totp_secret: null },
      });
    }

    console.log(`\n✅ 两步验证已重置（清除了 ${result.count} 个启用中的用户及残留密钥）。`);
    console.log("   现在可用账号 + 密码登录，之后可在「账户设置」重新启用两步验证。\n");
  } catch (error) {
    console.error("\n❌ 发生错误:", error);
    process.exitCode = 1;
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

function question(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => resolve(answer));
  });
}

main();
