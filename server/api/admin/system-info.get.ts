import { getUser } from "#server/lib/auth";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";
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
    // 数据库版本：$queryRaw 行形状用局部类型收窄（避免内联 as Array<{version}> 违反约定4）
    const dbVersionRows = await prisma.$queryRaw<{ version: string }[]>`SELECT version() as version`;
    const dbVersion = dbVersionRows[0]?.version || 'Unknown';

    // 附件统计：count() 计数 + 只拉 metadata 求和（避免全量 findMany 载入所有行）
    const attachmentCount = await prisma.attachments.count();
    const attachmentMetas = await prisma.attachments.findMany({ select: { metadata: true } });
    const attachmentTotalSize = attachmentMetas.reduce((total, attachment) => {
      return total + normalizeAttachmentMetadata(attachment.metadata).size;
    }, 0);

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
        version: dbVersion,
      },
      attachments: {
        count: attachmentCount,
        totalSize: attachmentTotalSize,
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取系统信息失败",
    });
  }
});
