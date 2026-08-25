import type { Prisma } from "@prisma/client";

import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

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
    // page/pageSize 未钳正负边界：负数进 skip/take 让 Prisma 抛错→500；floor + 上下限
    const rawPage = Number(query.page);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const rawPageSize = Number(query.pageSize);
    const pageSize = Number.isFinite(rawPageSize) ? Math.min(100, Math.max(1, Math.floor(rawPageSize))) : 10;
    // status 也按有限数收窄：空串/非法值 → undefined（丢弃该筛选），避免 NaN 落到 Int where 抛错→500
    const rawStatus = query.status !== undefined ? Number(query.status) : undefined;
    const status = rawStatus !== undefined && Number.isFinite(rawStatus) ? Math.trunc(rawStatus) : undefined;

    const where: Prisma.contentsWhereInput = {
      type: 1, // 1: 页面
    };

    if (status !== undefined) {
      where.status = status;
    }

    const [contents, total] = await Promise.all([
      prisma.contents.findMany({
        where,
        orderBy: { create_time: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // 约定1 白名单：列表页不取正文 content（LongText），只取列表字段
        select: {
          cid: true,
          title: true,
          slug: true,
          desc: true,
          status: true,
          create_time: true,
          update_time: true,
          user: {
            select: {
              uid: true,
              name: true,
              nickname: true,
            },
          },
        },
      }),
      prisma.contents.count({ where }),
    ]);

    // 批量取所有页面的分类关系（N+1 → 2 次查询），按 cid 归组
    const cids = contents.map(c => c.cid);
    const relRows = await prisma.contentrelations.findMany({
      where: { cid: { in: cids } },
      select: {
        cid: true,
        mid: true,
        metas: {
          select: {
            mid: true,
            name: true,
            slug: true,
          },
        },
      },
    });
    const relByCid = new Map<number, typeof relRows>();
    for (const rel of relRows) {
      const list = relByCid.get(rel.cid) ?? [];
      list.push(rel);
      relByCid.set(rel.cid, list);
    }

    const pagesWithRelations = contents.map(content => ({
      ...content,
      relations: relByCid.get(content.cid) ?? [],
    }));

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: pagesWithRelations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取页面失败",
    });
  }
});
