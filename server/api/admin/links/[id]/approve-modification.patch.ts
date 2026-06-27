import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少友链ID",
    });
  }

  const body = await readBody(event);
  const { action } = body; // "approve" 或 "reject"

  if (action !== "approve" && action !== "reject") {
    throw createError({
      statusCode: 400,
      message: "无效的操作",
    });
  }

  try {
    // 查找修改请求
    const modification = await prisma.links.findUnique({
      where: { id: Number(id) },
      include: {
        originalLink: true,
      },
    });

    if (!modification) {
      throw createError({
        statusCode: 404,
        message: "修改请求不存在",
      });
    }

    if (!modification.isModification) {
      throw createError({
        statusCode: 400,
        message: "这不是一个修改请求",
      });
    }

    if (!modification.originalLinkId) {
      throw createError({
        statusCode: 400,
        message: "缺少原友链ID",
      });
    }

    if (action === "approve") {
      // 批准修改：更新原友链，删除修改请求
      await prisma.links.update({
        where: { id: modification.originalLinkId },
        data: {
          name: modification.name,
          link: modification.link,
          desc: modification.desc,
          avatar: modification.avatar,
        },
      });

      // 删除修改请求
      await prisma.links.delete({
        where: { id: Number(id) },
      });

      return {
        success: true,
        message: "已批准修改，原友链已更新",
      };
    } else {
      // 拒绝修改：更新状态并删除修改请求
      await prisma.links.delete({
        where: { id: Number(id) },
      });

      return {
        success: true,
        message: "已拒绝修改请求",
      };
    }
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "审核失败",
    });
  }
});
