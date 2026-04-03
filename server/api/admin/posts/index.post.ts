import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
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
    },
  });

  return {
    success: true,
    data: post,
  };
});
