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
    tags,
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

  // 准备更新数据
  const updateData: any = {
    title,
    desc,
    content,
    status,
    many_covers: manyCovers,
    covers,
    show_toc: showToc,
    tags,
    // 如果提供了 publishDate，更新 create_time
    ...(publishDate ? { create_time: new Date(publishDate) } : {}),
  };

  // 处理 slug：只有当提供了新的 slug 且与当前不同时才更新
  if (slug !== undefined && slug !== null && slug !== existing.slug) {
    // 检查新 slug 是否已被其他文章使用
    const slugExists = await prisma.post.findFirst({
      where: {
        slug,
        cid: { not: cid }, // 排除当前文章
      },
    });

    if (slugExists) {
      throw createError({
        statusCode: 400,
        message: `Slug "${slug}" 已被其他文章使用，请使用不同的 slug`,
      });
    }

    updateData.slug = slug;
  } else if (!slug && !existing.slug) {
    // 如果当前没有 slug 且没有提供新 slug，使用 cid 作为 slug
    updateData.slug = String(cid);
  }

  // 更新文章
  const post = await prisma.post.update({
    where: { cid },
    data: updateData,
  });

  return {
    success: true,
    data: post,
  };
});
