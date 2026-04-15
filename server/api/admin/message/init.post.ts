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
    // 检查是否已存在留言板文章
    const existingPost = await prisma.post.findFirst({
      where: { slug: "message-board" },
    });

    if (existingPost) {
      // 更新 meta 表中的配置
      await prisma.information.upsert({
        where: { key: "messagePostId" },
        create: { key: "messagePostId", value: existingPost.cid.toString() },
        update: { value: existingPost.cid.toString() },
      });

      return {
        code: 200,
        message: "留言板已存在",
        data: { postId: existingPost.cid },
      };
    }

    // 创建新的留言板文章
    const messagePost = await prisma.post.create({
      data: {
        title: "留言板",
        slug: "message-board",
        content: "",
        desc: "留言板 - 用于收集访客留言和建议",
        status: 1, // 发布状态
        show_toc: false,
      },
    });

    // 在 meta 表中记录留言板文章 ID
    await prisma.information.upsert({
      where: { key: "messagePostId" },
      create: { key: "messagePostId", value: messagePost.cid.toString() },
      update: { value: messagePost.cid.toString() },
    });

    return {
      code: 200,
      message: "留言板初始化成功",
      data: { postId: messagePost.cid },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "初始化留言板失败",
    });
  }
});
