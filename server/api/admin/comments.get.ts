import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { createHash } from "node:crypto";

// 生成 Gravatar 头像 URL
function getAvatarUrl(email: string | null): string | null {
  if (!email) return null;

  const hash = createHash("md5").update(email.toLowerCase().trim()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`;
}

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  try {
    const query = getQuery(event);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const cid = query.cid ? Number(query.cid) : null;

    // 构建查询条件
    const where = cid ? { cid } : {};

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { create_time: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          coid: true,
          cid: true,
          name: true,
          mail: true,
          link: true,
          content: true,
          create_time: true,
          status: true,
          parent_id: true,
          agent: true,
          ip: true,
          post: {
            select: {
              cid: true,
              title: true,
            },
          },
        },
      }),
      prisma.comment.count({ where }),
    ]);

    // 在服务端生成头像 URL
    const commentsWithAvatar = comments.map(comment => ({
      ...comment,
      avatarUrl: getAvatarUrl(comment.mail),
    }));

    return {
      data: commentsWithAvatar,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error) {
    console.error("获取评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取评论列表失败",
    });
  }
});
