import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execAsync = promisify(exec);

// 锁文件路径
const LOCK_FILE_PATH = path.join(process.cwd(), ".system-initialized.lock");

export default defineEventHandler(async event => {
  try {
    // 检查锁文件是否存在
    if (fs.existsSync(LOCK_FILE_PATH)) {
      throw createError({
        statusCode: 404,
        message: "系统已初始化",
      });
    }

    console.log("[初始化系统] 开始初始化系统...");

    // 1. 生成 Prisma Client
    console.log("[初始化系统] 生成 Prisma Client...");
    try {
      await execAsync("npx prisma generate", {
        cwd: process.cwd(),
        env: process.env,
      });
    } catch (error) {
      console.error("[初始化系统] Prisma generate 失败:", error);
      throw new Error("Prisma Client 生成失败");
    }

    // 2. 创建数据库表（使用 deploy 模式，避免交互式提示）
    console.log("[初始化系统] 创建数据库表...");
    try {
      await execAsync("npx prisma migrate deploy", {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
        },
      });
    } catch (error) {
      console.error("[初始化系统] 数据库迁移失败:", error);
      throw new Error("数据库表创建失败");
    }

    // 3. 运行种子数据
    console.log("[初始化系统] 插入示例数据...");
    try {
      await execAsync("npx prisma db seed", {
        cwd: process.cwd(),
        env: process.env,
      });
    } catch (error) {
      console.error("[初始化系统] 种子数据插入失败:", error);
      throw new Error("示例数据插入失败");
    }

    // 4. 创建锁文件
    console.log("[初始化系统] 创建锁文件...");
    fs.writeFileSync(
      LOCK_FILE_PATH,
      JSON.stringify({
        initializedAt: new Date().toISOString(),
        environment: process.env.NODE_ENV || "unknown",
      }),
    );

    console.log("[初始化系统] 系统初始化完成！");

    return {
      success: true,
      message: "系统初始化成功",
      data: {
        initializedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error("[初始化系统] 初始化失败:", error);

    // 如果是 404 错误（系统已初始化），直接抛出
    if (error.statusCode === 404) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: error.message || "系统初始化失败",
    });
  }
});
