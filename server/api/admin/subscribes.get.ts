import {prisma} from "#server/utils/prisma";
import {getUser} from "#server/lib/auth";
import {getSourceStatus} from "#server/utils/rss";

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
    // 约定1 白名单：select 显式取字段，不裸返回整行
    const subscribes = await prisma.subscribes.findMany({
      select: { id: true, url: true, name: true, avatar: true, lastUpdated: true },
      orderBy: { id: "desc" },
    });
    // 附加最近一次更新的状态（内存，重启归零），无记录为 null（表格状态列展示）
    return subscribes.map(sub => ({
      ...sub,
      lastUpdateStatus: getSourceStatus(sub.id),
    }));
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取订阅列表失败",
    });
  }
});
