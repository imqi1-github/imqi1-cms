import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateContentData } from "#server/utils/validation";

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
    status = 1,
    type = 0,
    manyCovers = false,
    covers,
    showToc = false,
    publishDate,
    csrfToken,
  } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!title) {
    throw createError({
      statusCode: 400,
      message: "标题不能为空",
    });
  }

  // 验证字段长度
  validateContentData({ title, slug });

  // 处理发布日期
  let createTime: Date | undefined = undefined;
  if (publishDate) {
    createTime = new Date(publishDate);
  }

  // 创建文章
  const contentRecord = await prisma.contents.create({
    data: {
      title,
      desc,
      slug: slug || undefined, // 如果没有提供 slug，设为 undefined 让数据库使用默认值
      content,
      status,
      type,
      many_covers: manyCovers,
      covers,
      show_toc: showToc,
      create_time: createTime,
      update_time: new Date(),
      uid: user.uid, // 设置文章作者为当前登录用户
    },
  });

  // 如果没有提供 slug，使用 cid 作为 slug
  if (!slug) {
    await prisma.contents.update({
      where: { cid: contentRecord.cid },
      data: { slug: String(contentRecord.cid) },
    });
  }

  // 前端保存后只需 cid（跳转/关联），不再回查全字段（含正文）。
  return {
    success: true,
    data: { cid: contentRecord.cid },
  };
});
