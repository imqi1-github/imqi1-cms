import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  try {
    // 获取数据库版本
    const dbVersion = await prisma.$queryRaw`SELECT VERSION() as version`;

    // 获取附件统计
    const attachmentCount = await prisma.attachment.count();

    // 获取系统运行时间（进程启动时间）
    const uptime = process.uptime();
    const uptimeDays = Math.floor(uptime / 86400);
    const uptimeHours = Math.floor((uptime % 86400) / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);

    return {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      uptime: `${uptimeDays}天 ${uptimeHours}小时 ${uptimeMinutes}分钟`,
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
        unit: 'MB',
      },
      database: {
        version: (dbVersion as any)[0]?.version || 'Unknown',
      },
      attachments: {
        count: attachmentCount,
        totalSize: 0, // 附件表没有 size 字段，暂不统计
      },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取系统信息失败",
    });
  }
});
