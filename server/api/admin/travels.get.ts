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
  try {
    const travels = await prisma.travels.findMany({
      orderBy: [{ sort: "asc" }, { create_time: "desc" }],
      include: {
        // posts 为 posttravels[] 关联表，通过 .post 取文章
        posts: { select: { post: { select: { cid: true, title: true } } } },
      },
    });

    // 展平：每条地点附带 cids（数字数组）与 posts（{cid,title}[]）
    return travels.map(t => {
      const posts = t.posts.map(r => r.post);
      return {
        id: t.id,
        name: t.name,
        desc: t.desc,
        cover: t.cover,
        longitude: t.longitude,
        latitude: t.latitude,
        sort: t.sort,
        enabled: t.enabled,
        create_time: t.create_time,
        posts,
        cids: posts.map(p => p.cid),
      };
    });
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取旅行地点失败",
    });
  }
});
