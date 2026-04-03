import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event);

  const {
    title,
    desc,
    slug,
    content,
    status = 0,
    manyCovers = false,
    covers,
    showToc = true,
    publishDate,
  } = body;

  if (!title) {
    throw createError({
      statusCode: 400,
      message: "标题不能为空",
    });
  }

  // 处理发布日期
  let createTime: Date | undefined = undefined;
  if (publishDate) {
    createTime = new Date(publishDate);
  }

  // 创建文章
  const post = await prisma.post.create({
    data: {
      title,
      desc,
      slug,
      content,
      status,
      many_covers: manyCovers,
      covers,
      show_toc: showToc,
      create_time: createTime,
      uid: user.uid, // 设置文章作者为当前登录用户
    },
  });

  return {
    success: true,
    data: post,
  };
});
