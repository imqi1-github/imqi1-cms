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
    // 负数/浮点 page 会让 skip/take 为非负整数失败 → Prisma 抛错 500；floor + 上下限 + 整数校验
    const rawPage = Number(query.page);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const rawPageSize = Number(query.pageSize);
    const pageSize = Number.isFinite(rawPageSize) ? Math.min(100, Math.max(1, Math.floor(rawPageSize))) : 10;
    const categoryId = Number.isInteger(Number(query.category)) ? Number(query.category) : undefined;
    const tagId = Number.isInteger(Number(query.tag)) ? Number(query.tag) : undefined;
    // status 必须为整数否则不进 where（NaN 真值判空会骗过 if，进 Prisma 抛错）
    const status = Number.isInteger(Number(query.status)) ? Number(query.status) : undefined;

    const where: Prisma.contentsWhereInput = {
      type: 0, // 0: 文章
    };

    if (categoryId) {
      where.contentrelations = {
        some: {
          mid: categoryId,
        },
      };
    }

    if (tagId) {
      where.AND = [
        {
          contentrelations: {
            some: {
              mid: tagId,
            },
          },
        },
      ];
    }

    if (status !== undefined) {
      where.status = status;
    }

    const [contents, total] = await Promise.all([
      prisma.contents.findMany({
        where,
        orderBy: { cid: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // 列表不取正文 content（LongText，量大）；只有详情接口 [cid].get 才回正文供编辑
        select: {
          cid: true,
          title: true,
          slug: true,
          desc: true,
          create_time: true,
          update_time: true,
          status: true,
          comment_num: true,
          many_covers: true,
          covers: true,
          show_toc: true,
          tags: true,
          type: true,
          uid: true,
          user: {
            select: {
              uid: true,
              name: true,
              avatar: true,
            },
          },
          contentrelations: {
            select: {
              cid: true,
              mid: true,
              metas: {
                select: {
                  mid: true,
                  name: true,
                  slug: true,
                  type: true,
                },
              },
            },
          },
        },
      }),
      prisma.contents.count({ where }),
    ]);

    return {
      data: contents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取文章列表失败",
    });
  }
});
