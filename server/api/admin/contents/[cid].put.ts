import type { Prisma } from "@prisma/client";

import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateContentData } from "#server/utils/validation";

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

  const { csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

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
    type,
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

  // 验证字段长度
  validateContentData({ title, slug });

  // 检查文章是否存在
  const existing = await prisma.contents.findUnique({
    where: { cid },
  });

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: "文章不存在",
    });
  }

  // 准备更新数据
  const updateData: Prisma.contentsUpdateInput = {
    title,
    desc,
    content,
    status,
    ...(type !== undefined && { type }),
    many_covers: manyCovers,
    covers,
    show_toc: showToc,
    update_time: new Date(),
    // 如果提供了 publishDate，更新 create_time
    ...(publishDate ? { create_time: new Date(publishDate) } : {}),
  };

  // 处理 slug：只有当提供了新的 slug 且与当前不同时才更新
  if (slug !== undefined && slug !== null && slug !== existing.slug) {
    // 检查新 slug 是否已被其他文章使用（同一 type 下唯一）
    const slugExists = await prisma.contents.findFirst({
      where: {
        slug,
        type: existing.type, // 使用当前文章的 type
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
  await prisma.contents.update({
    where: { cid },
    data: updateData,
  });

  // 前端保存后只需 cid，不再回查全字段（含正文）。
  return {
    success: true,
    data: { cid },
  };
});
