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

  const body = await readBody(event);
  const { class: classType, desc } = body;

  if (!desc || !desc.trim()) {
    throw createError({
      statusCode: 400,
      message: "内容不能为空",
    });
  }

  // 创建更新日志
  const changelog = await prisma.changelog.create({
    data: {
      class: classType || "新增",
      desc: desc.trim(),
    },
  });

  return {
    success: true,
    data: changelog,
  };
});
