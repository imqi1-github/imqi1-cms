import {prisma} from "#server/utils/prisma";
import {getUser} from "#server/lib/auth";

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
    return await prisma.contents.findMany({
      where: {
        type: 0, // 0: 文章，排除页面（type=1）
      },
      take: 5,
      orderBy: {create_time: "desc"},
      // 仪表盘「最新文章」列表只展示标题/时间/状态，按 cid 编辑/删除；无需正文等大字段
      select: {
        cid: true,
        title: true,
        create_time: true,
        status: true,
      },
    });
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取最新文章失败",
    });
  }
});
