import { buildUrlKeys, hasSharedUrlKey } from "#server/utils/cover-keys";
import type { MiniCategoryContent, MiniCategoryContentsResponse } from "#server/types/apis/mini";
import { parseCovers } from "#server/utils/covers";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";
import { formatRelativeTime, toAbsoluteUrl } from "#server/utils/mini";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  const categorySlug = getRouterParam(event, "slug");
  const query = getQuery(event);

  if (!categorySlug) {
    throw createError({
      statusCode: 400,
      message: "分类 slug 不能为空",
    });
  }

  const page = Math.min(10000, Math.max(1, parseInt(String(query.page), 10) || 1));
  const pageSize = Math.max(1, Math.min(50, parseInt(String(query.pageSize), 10) || 12));
  const skip = (page - 1) * pageSize;

  try {
    const category = await prisma.metas.findUnique({
      where: { slug: categorySlug, type: "category" },
      select: { mid: true, name: true, slug: true, desc: true },
    });

    if (!category) {
      throw createError({
        statusCode: 404,
        message: "分类不存在",
      });
    }

    const contentWhere = {
      metas: { slug: categorySlug, type: "category" },
      content: { type: 0, status: 1 },
    };

    const total = await prisma.contentrelations.count({ where: contentWhere });

    const requestUrl = getRequestURL(event);
    const relations = await prisma.contentrelations.findMany({
      where: contentWhere,
      include: {
        content: {
          select: {
            cid: true,
            title: true,
            covers: true,
            create_time: true,
            attachments: {
              where: { attachment: { type: "image" } },
              select: {
                attachment: {
                  select: { url: true, metadata: true },
                },
              },
            },
          },
        },
      },
      orderBy: {
        content: { create_time: "desc" },
      },
      skip,
      take: pageSize,
    });

    const contents: MiniCategoryContent[] = relations.map(relation => {
      const content = relation.content;

      const attachmentMetadata = content.attachments.map(item => ({
        keys: buildUrlKeys(item.attachment.url),
        metadata: normalizeAttachmentMetadata(item.attachment.metadata),
      }));

      const covers = parseCovers(content.covers);
      const firstCover = covers[0];
      const coverCount = covers.length;
      let coverWidth = firstCover?.width ?? null;
      let coverHeight = firstCover?.height ?? null;

      if (firstCover && (!coverWidth || !coverHeight)) {
        const coverKeys = buildUrlKeys(firstCover.url);
        const matched = attachmentMetadata.find(item => hasSharedUrlKey(item.keys, coverKeys));
        if (matched) {
          coverWidth = matched.metadata.width;
          coverHeight = matched.metadata.height;
        }
      }

      return {
        id: content.cid,
        title: content.title,
        cover: toAbsoluteUrl(firstCover?.url ?? "", requestUrl.origin),
        coverCount,
        coverWidth,
        coverHeight,
        publishedAt: formatRelativeTime(content.create_time),
        created: content.create_time.toISOString(),
      };
    });

    return {
      success: true,
      data: {
        category: {
          mid: category.mid,
          name: category.name,
          slug: category.slug ?? categorySlug,
          desc: category.desc,
        },
        contents,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    } satisfies MiniCategoryContentsResponse;
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序分类文章失败",
    });
  }
});
