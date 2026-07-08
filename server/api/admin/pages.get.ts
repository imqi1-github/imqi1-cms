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
    const page = parseInt(query.page as string) || 1;
    const pageSize = parseInt(query.pageSize as string) || 10;
    const status = query.status !== undefined ? parseInt(query.status as string) : undefined;

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
        include: {
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

    // 获取每个页面的分类
    const pagesWithRelations = await Promise.all(
      contents.map(async content => {
        const relations = await prisma.contentrelations.findMany({
          where: { cid: content.cid },
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

        return {
          ...content,
          relations,
        };
      })
    );

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
