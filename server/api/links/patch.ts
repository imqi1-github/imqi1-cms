import { prisma } from "#server/utils/prisma";
import { validateLinkData } from "#server/utils/validation";
import { notifyFriendLinkModification } from "#server/utils/mail";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);

    // 验证必填字段
    if (!body.name || !body.link) {
      throw createError({
        statusCode: 400,
        message: "名称和链接为必填项",
      });
    }

    // 验证原友链ID
    if (!body.originalLinkId) {
      throw createError({
        statusCode: 400,
        message: "缺少原友链ID",
      });
    }

    // 验证字段长度
    validateLinkData({
      name: body.name,
      link: body.link,
      desc: body.desc,
      avatar: body.avatar,
    });

    // 验证链接格式
    const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    if (!urlRegex.test(body.link)) {
      throw createError({
        statusCode: 400,
        message: "链接格式不正确",
      });
    }

    // 查找原友链
    const originalLink = await prisma.links.findUnique({
      where: { id: body.originalLinkId },
    });

    if (!originalLink) {
      throw createError({
        statusCode: 404,
        message: "原友链不存在",
      });
    }

    // 创建修改请求（默认禁用，等待审核）
    const modificationLink = await prisma.links.create({
      data: {
        name: body.name.trim(),
        link: body.link.trim(),
        desc: body.desc?.trim() || null,
        avatar: body.avatar?.trim() || null,
        enabled: false,  // 默认禁用，等待审核
        isModification: true,
        originalLinkId: body.originalLinkId,
        modificationStatus: "pending",
      },
    });

    // 发送邮件通知站长（异步，不阻塞响应）
    notifyFriendLinkModification(
      { name: originalLink.name, link: originalLink.link },
      { name: modificationLink.name, link: modificationLink.link, desc: modificationLink.desc, avatar: modificationLink.avatar }
    );

    return {
      code: 200,
      message: "友链修改请求已提交，等待管理员审核",
      data: modificationLink,
    };
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      });
    }
    throw createError({
      statusCode: 500,
      message: "提交修改请求失败",
    });
  }
});
