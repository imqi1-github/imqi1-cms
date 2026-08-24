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
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const categoryId = query.category ? Number(query.category) : undefined;
    const tagId = query.tag ? Number(query.tag) : undefined;
    const status = query.status ? Number(query.status) : undefined;

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
