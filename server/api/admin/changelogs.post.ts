import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateChangelogData } from "#server/utils/validation";

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

  try {
    // 验证字段长度
    validateChangelogData({ class: body.class, desc: body.desc });

    const changelog = await prisma.changelog.create({
      data: {
        class: body.class,
        desc: body.desc,
      },
    });
    return changelog;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "创建更新日志失败",
    });
  }
});
