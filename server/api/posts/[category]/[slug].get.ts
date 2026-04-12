import { prisma } from "#server/utils/prisma";
import { renderMarkdown } from "#server/utils/markdown";

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

  // 构建查询条件 - 必须同时匹配分类和文章
  const post = await prisma.post.findFirst({
    where: {
      slug,
      type: 0, // 0: 文章
      status: 1, // 只返回已发布的文章 (status: 1 = 已发布)
      postrelation: {
        some: {
          category: {
            slug: categorySlug,
          },
        },
      },
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
      postrelation: {
        include: {
          category: {
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

  if (!post) {
    throw createError({
      statusCode: 404,
      message: "文章不存在",
    });
  }

  // 过滤 postrelation，只保留分类（type = "category"）
  const categoryRelations = post.postrelation.filter(
    relation => relation.category.type === "category"
  );

  // 过滤出标签关系（type = "tag"）
  const tagRelations = post.postrelation.filter(
    relation => relation.category.type === "tag"
  );

  // 解析封面 - 支持 JSON 数组或换行分隔格式
  let covers = [];
  if (post.covers) {
    try {
      const parsed = JSON.parse(post.covers);
      if (Array.isArray(parsed)) {
        covers = parsed.map(item => ({
          url: item.url || item,
          desc: item.title || item.desc || '',
        }));
      }
    } catch {
      covers = post.covers.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.includes('||')) {
          const [url, desc] = trimmed.split('||');
          return { url: url.trim(), desc: desc?.trim() || '' };
        }
        return { url: trimmed, desc: '' };
      }).filter(Boolean);
    }
  }

  // 从 tagRelations 构建标签信息
  const tags = tagRelations.map(relation => ({
    name: relation.category.name,
    slug: relation.category.slug,
  }));

  // 在服务端渲染 Markdown 内容
  const renderedContent = post.content ? await renderMarkdown(post.content) : "";

  return {
    success: true,
    data: {
      ...post,
      postrelation: categoryRelations, // 只返回分类关系
      covers,
      tags,
      parsedCovers: covers,
      renderedContent, // 返回已渲染的 HTML
    },
  };
});
