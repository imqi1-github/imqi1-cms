import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);

    // 公开分页参数 limit：clamp 到正整 1..100，NaN/float/负/Infinity 不得直接传给 Prisma take；
    // 未传 limit 或非字符串（重复参数成数组/空串/null）→ 采用默认 3
    const rawLimit = query.limit;
    const limit =
      typeof rawLimit === "string" && rawLimit.trim() !== ""
        ? Math.min(100, Math.max(1, Math.floor(Number(rawLimit)) || 3))
        : 3;

    // 相关性候选池：先取出稍宽的候选集（共享标签的已发布文章），再按相关度排序并截取前 limit 条。
    // 若直接 take:limit 再排序，老但高相关的文章会被"最新 N 条"挡在外面，使"相关推荐"失去意义。
    const candidateLimit = Math.min(100, Math.max(limit * 4, 20));

    // 路由参数 cid 防御性校验：NaN/浮点/负数一律 400，避免把浮点整型传给 Prisma 主键过滤
    const rawContentId = Number(getRouterParam(event, "cid"));
    if (!rawContentId || !Number.isInteger(rawContentId) || rawContentId < 1) {
      throw createError({
        statusCode: 400,
        message: "文章ID不能为空",
      });
    }
    const contentId = rawContentId;

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
      // take 用一个更宽的候选池，使相关性排序有意义；最终在 JS 里按相关度排序后 slice 到 limit 条
      take: candidateLimit,
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
    const err = error as { statusCode?: number; code?: string };
    // 带 statusCode 的错误（含本处理器抛出的 createError 400）原样抛出，绝不吞成 200 success:false
    if (err && typeof err.statusCode === "number") {
      throw error;
    }
    // Prisma 记录不存在 → 404
    if (err && err.code === "P2025") {
      throw createError({
        statusCode: 404,
        message: "文章不存在",
      });
    }
    // 未知故障：记录详细日志，抛通用 500，绝不把 error.message 透传给前端
    console.error("[related-contents]", error);
    throw createError({
      statusCode: 500,
      message: "获取相关文章失败",
    });
  }
});
