import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const cid = Number(getRouterParam(event, 'cid'));
  const body = await readBody(event);

  if (!cid) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 不能为空",
    });
  }

  const {
    title,
    desc,
    slug,
    content,
    status,
    manyCovers,
    covers,
    showToc,
    publishDate,
  } = body;

  if (!title) {
    throw createError({
      statusCode: 400,
      message: "标题不能为空",
    });
  }

  // 检查文章是否存在
  const existing = await prisma.post.findUnique({
    where: { cid },
  });

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: "文章不存在",
    });
  }

  // 更新文章
  const post = await prisma.post.update({
    where: { cid },
    data: {
      title,
      desc,
      slug,
      content,
      status,
      many_covers: manyCovers,
      covers,
      show_toc: showToc,
      // 如果提供了 publishDate，更新 create_time
      ...(publishDate ? { create_time: new Date(publishDate) } : {}),
    },
  });

  return {
    success: true,
    data: post,
  };
});
