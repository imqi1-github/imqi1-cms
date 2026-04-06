import { prisma } from "#server/utils/prisma";
import { notifyFriendLinkApplication } from "#server/utils/mail";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);

    // 验证参数
    if (!body.name || !body.link) {
      throw createError({
        statusCode: 400,
        message: "名称和链接为必填项",
      });
    }

    // 验证链接格式
    const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    if (!urlRegex.test(body.link)) {
      throw createError({
        statusCode: 400,
        message: "链接格式不正确",
      });
    }

    // 创建友链（默认禁用状态，需要管理员审核）
    const link = await prisma.link.create({
      data: {
        name: body.name.trim(),
        link: body.link.trim(),
        desc: body.sort?.trim() || null,
        avatar: body.avatar?.trim() || null,
        enabled: false
      }
    });

    // 1. 友链申请通知 - 通知站长
    // 异步发送邮件，不阻塞响应
    notifyFriendLinkApplication(link.name, link.link);

    return {
      code: 200,
      message: "申请友链成功，等待管理员审核",
      data: link
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
      message: "申请友链失败",
    });
  }
});
