import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validatePostData } from "#server/utils/validation";

console.log("===== 文章 POST API 已加载 =====");

export default defineEventHandler(async event => {
  console.log("===== 文章 POST API 被调用 =====");
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
    tags,
  } = body;

  if (!title) {
    throw createError({
      statusCode: 400,
      message: "标题不能为空",
    });
  }

  // 验证字段长度
  validatePostData({ title, slug, tags });

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
      slug: slug || undefined, // 如果没有提供 slug，设为 undefined 让数据库使用默认值
      content,
      status,
      type,
      many_covers: manyCovers,
      covers,
      show_toc: showToc,
      create_time: createTime,
      update_time: new Date(), // 添加 update_time
      tags,
      uid: user.uid, // 设置文章作者为当前登录用户
    },
  });

  // 如果没有提供 slug，使用 cid 作为 slug
  if (!slug) {
    await prisma.post.update({
      where: { cid: post.cid },
      data: { slug: String(post.cid) },
    });
  }

  // 重新获取完整的文章信息（包含关联数据）
  const updatedPost = await prisma.post.findUnique({
    where: { cid: post.cid },
    include: {
      user: {
        select: {
          uid: true,
          name: true,
          nickname: true,
          avatar: true,
          mail: true,
        },
      },
    },
  });

  return {
    success: true,
    data: updatedPost,
  };
});
