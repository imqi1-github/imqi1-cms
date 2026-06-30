import { prisma } from "#server/utils/prisma";
import { renderMarkdown } from "#server/utils/markdown";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  const slug = getRouterParam(event, 'slug');
  const categorySlug = getRouterParam(event, 'category');

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "文章 slug 不能为空",
    });
  }

  if (!categorySlug) {
    throw createError({
      statusCode: 400,
      message: "分类 slug 不能为空",
    });
  }

  // 构建查询条件
  // uncategorized 是兜底分类：仅匹配「没有任何分类」的文章。
  // 若文章已归属某个分类，则通过 uncategorized 访问视为 404（slug 失效），
  // 避免同一篇文章存在多个详情页 URL。
  const isUncategorized = categorySlug === "uncategorized";
  const post = await prisma.posts.findFirst({
    where: {
      slug,
      type: 0, // 0: 文章
      status: 1, // 只返回已发布的文章 (status: 1 = 已发布)
      ...(isUncategorized
        ? {
            postrelations: {
              none: {
                metas: {
                  type: "category",
                },
              },
            },
          }
        : {
            postrelations: {
              some: {
                metas: {
                  slug: categorySlug,
                  type: "category",
                },
              },
            },
          }),
    },
    include: {
      user: {
        select: {
          uid: true,
          name: true,
          nickname: true,
          avatar: true,
        },
      },
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
      // travels 为 posttravels[] 关联表，过滤启用地点后取 {id,name}
      travels: {
        where: { travel: { enabled: true } },
        select: { travel: { select: { id: true, name: true } } },
      },
    },
  });

  if (!post) {
    throw createError({
      statusCode: 404,
      message: "文章不存在",
    });
  }

  // 过滤 postrelations，只保留分类（type = "category"）
  const categoryRelations = post.postrelations.filter(
    relation => relation.metas.type === "category"
  );

  // 过滤出标签关系（type = "tag"）
  const tagRelations = post.postrelations.filter(
    relation => relation.metas.type === "tag"
  );

  // 解析封面 - 支持 JSON 数组或换行分隔格式
  const covers = parseCovers(post.covers);

  // 从 tagRelations 构建标签信息
  const tags = tagRelations.map(relation => ({
    name: relation.metas.name,
    slug: relation.metas.slug,
  }));

  // 在服务端渲染 Markdown 内容
  const renderedContent = post.content ? await renderMarkdown(post.content) : "";

  return {
    success: true,
    data: {
      ...post,
      travels: post.travels.map(t => t.travel), // 展平为 [{id,name}]
      postrelations: categoryRelations, // 只返回分类关系
      covers,
      tags,
      parsedCovers: covers,
      renderedContent, // 返回已渲染的 HTML
    },
  };
});
