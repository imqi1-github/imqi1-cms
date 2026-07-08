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
    const comments = await prisma.comments.findMany({
      take: 5,
      orderBy: {create_time: "desc"},
      include: {
        content_ref: {
          select: {
            title: true,
            cid: true,
          },
        },
      },
    });
    // 保持前端契约：关联文章仍以 contents 返回
    return comments.map(({ content_ref, ...rest }) => ({
      ...rest,
      contents: content_ref,
    }));
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取最新评论失败",
    });
  }
});
