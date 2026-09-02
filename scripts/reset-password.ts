import * as readline from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

// 固定加载项目根的 .env（脚本可能从任意 cwd 运行，勿依赖 dotenv 默认的 cwd 查找）
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

// 缺失时给出明确提示，避免连接报错难以定位
if (!DB_PASSWORD) {
  console.error("❌ 缺少数据库配置 DB_PASSWORD，请检查 .env");
  process.exit(1);
}
if (!DB_NAME) {
  console.error("❌ 缺少数据库配置 DB_NAME，请检查 .env");
  process.exit(1);
}

// 创建 Prisma 客户端（使用与项目相同的配置，PG 连接串走拆分 DB_* 变量）
const connectionString = `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({
  adapter,
});

// 创建 readline 接口用于读取用户输入
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 封装 readline 为 Promise
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log("\n=== 密码重置工具 ===\n");

  try {
    // 获取用户名
    const username = await question("请输入要重置密码的用户名: ");

    // 查询用户是否存在
    const user = await prisma.users.findUnique({
      where: { name: username },
      select: {
        uid: true,
        name: true,
        mail: true,
        nickname: true,
      },
    });

    if (!user) {
      console.error("\n❌ 错误: 用户不存在");
      return;
    }

    console.log(`\n找到用户: ${user.nickname || user.name} (${user.mail})`);

    // 确认操作
    const confirm = await question("\n确认要重置该用户的密码吗？: ");

    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("\n操作已取消");
      return;
    }

    // 获取新密码
    const newPassword = await question("\n请输入新密码: ");

    if (newPassword.length < 6) {
      console.error("\n❌ 错误: 密码长度至少为 6 位");
      return;
    }

    // 确认新密码
    const confirmPassword = await question("请再次输入新密码: ");

    if (newPassword !== confirmPassword) {
      console.error("\n❌ 错误: 两次输入的密码不一致");
      return;
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新数据库
    await prisma.users.update({
      where: { uid: user.uid },
      data: {
        password: hashedPassword,
        auth_code: null, // 清除 auth_code，使所有设备需要重新登录
      },
    });

    console.log("\n✅ 密码重置成功！");
    console.log(`用户名: ${user.name}`);
    console.log(`新密码: ${newPassword}`);
    console.log("\n提示: 所有已登录的设备都需要重新登录\n");

  } catch (error) {
    console.error("\n❌ 发生错误:", error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();
