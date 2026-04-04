import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { cid, content, name, mail, link, parent_id } = body;

    // 验证必填项
    if (!cid || !content || !name) {
      throw createError({
        statusCode: 400,
        message: "缺少必填参数",
      });
    }

    // 验证邮箱格式（如果提供）
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      throw createError({
        statusCode: 400,
        message: "邮箱格式不正确",
      });
    }

    // 验证链接格式（如果提供）
    if (link) {
      try {
        new URL(link);
      } catch {
        throw createError({
          statusCode: 400,
          message: "链接格式不正确",
        });
      }
    }

    // 获取用户代理信息
    const userAgent = getHeader(event, "user-agent") || "unknown";

    // 获取评论审核配置
    const meta = await prisma.meta.findUnique({
      where: { key: "commentModeration" },
    });

    // 是否需要审核（默认不需要）
    const needModeration = meta?.value === "true";

    // 创建评论
    const comment = await prisma.comment.create({
      data: {
        cid: parseInt(cid),
        content,
        name,
        mail: mail || null,
        link: link || null,
        parent_id: parent_id || null,
        status: needModeration ? 0 : 1, // 0: 待审核, 1: 已启用
        agent: userAgent,
      },
    });

    return {
      code: 200,
      message: needModeration ? "评论提交成功，请等待审核" : "评论提交成功",
      data: comment,
      needModeration,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      });
    }
    throw createError({
      statusCode: 500,
      message: "评论提交失败",
    });
  }
});
