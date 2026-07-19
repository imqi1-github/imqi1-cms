import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    const contentId = Number(getRouterParam(event, "cid"));
    const query = getQuery(event);
    const limit = Number(query.limit) || 3;

    if (!contentId) {
      throw createError({
        statusCode: 400,
        statusMessage: "文章ID不能为空",
      });
    }

    // 设置缓存头：CDN和浏览器缓存5分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // 获取当前文章的标签
    const currentContent = await prisma.contents.findUnique({
      where: { cid: contentId },
      select: {
        cid: true,
        contentrelations: {
          where: {
            metas: {
              type: "tag",
            },
          },
          select: {
            mid: true,
          },
        },
      },
    });

    if (!currentContent) {
      return {
        success: true,
        data: [],
      };
    }

    // 获取当前文章的所有标签 ID
    const tagMids = currentContent.contentrelations.map(r => r.mid);

    // 如果没有标签，返回空数组
    if (tagMids.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // 查找具有相同标签的文章（排除当前文章）
    const relatedContents = await prisma.contents.findMany({
      where: {
        cid: {
          not: contentId,
        },
        type: 0,
        status: 1,
        // 仅返回有 slug 的文章：无 slug 的文章无法走 /content/[category]/[slug] 详情路由，
        // 若作为相关文章会出现 /content/<cat>/null 死链
        slug: { not: null },
        contentrelations: {
          some: {
            mid: {
              in: tagMids,
            },
          },
        },
      },
      take: limit,
      orderBy: {
        create_time: "desc",
      },
      select: {
        cid: true,
        title: true,
        slug: true,
        desc: true,
        covers: true,
        create_time: true,
        comment_num: true,
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
    });

    // 计算每篇文章的相关性（相同标签数量）
    const contentsWithRelevance = relatedContents.map(content => {
      const contentTagMids = content.contentrelations
        .filter(r => r.metas.type === "tag")
        .map(r => r.mid);
      const commonTags = tagMids.filter(id => contentTagMids.includes(id));
      return {
        content,
        relevance: commonTags.length,
      };
    });

    // 按相关性排序，然后按时间排序
    contentsWithRelevance.sort((a, b) => {
      if (a.relevance !== b.relevance) {
        return b.relevance - a.relevance;
      }
      return b.content.create_time.getTime() - a.content.create_time.getTime();
    });

    // 格式化返回数据
    const data = contentsWithRelevance.slice(0, limit).map(({ content }) => {
      // 分离分类和标签
      const categories = content.contentrelations
        .filter(r => r.metas.type === "category")
        .map(r => ({
          name: r.metas.name,
          slug: r.metas.slug,
        }));

      const tags = content.contentrelations
        .filter(r => r.metas.type === "tag")
        .map(r => ({
          name: r.metas.name,
          slug: r.metas.slug,
        }));

      const covers = parseCovers(content.covers);

      return {
        cid: content.cid,
        title: content.title,
        slug: content.slug,
        desc: content.desc,
        covers,
        created: content.create_time,
        commentsNum: content.comment_num || 0,
        categories,
        tags,
      };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      data: [],
    };
  }
});
