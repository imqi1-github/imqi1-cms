import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const postId = Number(getRouterParam(event, "cid"));
    const query = getQuery(event);
    const limit = Number(query.limit) || 3;

    if (!postId) {
      throw createError({
        statusCode: 400,
        statusMessage: "文章ID不能为空",
      });
    }

    // 设置缓存头：CDN和浏览器缓存5分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // 获取当前文章的标签
    const currentPost = await prisma.posts.findUnique({
      where: { cid: postId },
      select: {
        cid: true,
        postrelations: {
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

    if (!currentPost) {
      return {
        success: true,
        data: [],
      };
    }

    // 获取当前文章的所有标签 ID
    const tagMids = currentPost.postrelations.map(r => r.mid);

    // 如果没有标签，返回空数组
    if (tagMids.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // 查找具有相同标签的文章（排除当前文章）
    const relatedPosts = await prisma.posts.findMany({
      where: {
        cid: {
          not: postId,
        },
        type: 0,
        status: 1,
        postrelations: {
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
        postrelations: {
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
    const postsWithRelevance = relatedPosts.map(post => {
      const postTagMids = post.postrelations
        .filter(r => r.metas.type === "tag")
        .map(r => r.mid);
      const commonTags = tagMids.filter(id => postTagMids.includes(id));
      return {
        post,
        relevance: commonTags.length,
      };
    });

    // 按相关性排序，然后按时间排序
    postsWithRelevance.sort((a, b) => {
      if (a.relevance !== b.relevance) {
        return b.relevance - a.relevance;
      }
      return b.post.create_time.getTime() - a.post.create_time.getTime();
    });

    // 格式化返回数据
    const data = postsWithRelevance.slice(0, limit).map(({ post }) => {
      // 分离分类和标签
      const categories = post.postrelations
        .filter(r => r.metas.type === "category")
        .map(r => ({
          name: r.metas.name,
          slug: r.metas.slug,
        }));

      const tags = post.postrelations
        .filter(r => r.metas.type === "tag")
        .map(r => ({
          name: r.metas.name,
          slug: r.metas.slug,
        }));

      let covers: { url: string; desc?: string }[] = [];
      if (post.covers) {
        try {
          covers = JSON.parse(post.covers);
        } catch {
          covers = [];
        }
      }

      return {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        desc: post.desc,
        covers,
        created: post.create_time,
        commentsNum: post.comment_num || 0,
        categories,
        tags,
      };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("获取相关文章失败:", error);
    return {
      success: false,
      data: [],
    };
  }
});
