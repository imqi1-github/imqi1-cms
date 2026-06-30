import * as readline from "readline";

import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config();

// 创建 Prisma 客户端（使用与项目相同的配置）
const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: 10,
});

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
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n=== 初始化管理员账户 ===\n");

  try {
    // 单用户系统：检查是否已有用户
    const existingCount = await prisma.users.count();
    if (existingCount > 0) {
      const existing = await prisma.users.findFirst({
        select: { name: true, mail: true },
      });
      console.log(`⚠️  系统已存在 ${existingCount} 个用户（${existing?.name} / ${existing?.mail}）。`);
      const confirm = await question("仍要继续创建新管理员吗？(y/N): ");
      if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
        console.log("操作已取消");
        return;
      }
    }

    // 获取用户名
    const name = await question("请输入用户名: ");
    if (!name) {
      console.error("\n❌ 错误: 用户名不能为空");
      return;
    }

    // 获取邮箱
    const mail = await question("请输入邮箱: ");
    if (!mail) {
      console.error("\n❌ 错误: 邮箱不能为空");
      return;
    }

    // 检查用户名/邮箱是否已被占用
    const byName = await prisma.users.findUnique({ where: { name } });
    if (byName) {
      console.error("\n❌ 错误: 用户名已被使用");
      return;
    }
    const byMail = await prisma.users.findUnique({ where: { mail } });
    if (byMail) {
      console.error("\n❌ 错误: 邮箱已被使用");
      return;
    }

    // 获取密码
    const password = await question("请输入密码 (至少 6 位): ");
    if (password.length < 6) {
      console.error("\n❌ 错误: 密码长度至少为 6 位");
      return;
    }

    const confirmPassword = await question("请再次输入密码: ");
    if (password !== confirmPassword) {
      console.error("\n❌ 错误: 两次输入的密码不一致");
      return;
    }

    // 加密密码并创建用户
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.users.create({
      data: {
        name,
        mail,
        password: hashedPassword,
      },
      select: {
        uid: true,
        name: true,
        mail: true,
      },
    });

    console.log("\n✅ 管理员账户创建成功！");
    console.log(`   UID:  ${user.uid}`);
    console.log(`   用户名: ${user.name}`);
    console.log(`   邮箱:  ${user.mail}`);
    console.log("\n现在可以使用该账户登录后台。\n");
  } catch (error) {
    console.error("\n❌ 发生错误:", error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();
