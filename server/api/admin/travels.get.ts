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
      // 足迹是天然小集合（地图点位，通常数十~数百）。保持扁平数组契约：列表页与内容编辑器
      // 的「关联地点选择器」都整取该集合（后者需全部点位供勾选）。上限仅作防无界全表兜底，
      // 取远高于实际规模的 2000，避免 >500 时静默截断；若真到数千点应另做分页+前端配套。
      take: 2000,
      orderBy: [{ sort: "asc" }, { create_time: "desc" }],
      include: {
        // contenttravels 为关联表，通过 .content 取文章
        contenttravels: { select: { content: { select: { cid: true, title: true } } } },
      },
    });

    // 展平：每条地点附带 cids（数字数组）与 contents（{cid,title}[]）
    return travels.map(t => {
      const contents = t.contenttravels.map(r => r.content);
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
        contents,
        cids: contents.map(p => p.cid),
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
