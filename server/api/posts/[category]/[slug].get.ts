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
      relations: {
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
      relations: {
        include: {
          category: {
            select: {
              mid: true,
              name: true,
              slug: true,
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

  // 解析标签
  const tags = post.tags
    ? post.tags.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  // 在服务端渲染 Markdown 内容
  const renderedContent = post.content ? await renderMarkdown(post.content) : "";

  return {
    success: true,
    data: {
      ...post,
      covers,
      tags,
      parsedCovers: covers,
      renderedContent, // 返回已渲染的 HTML
    },
  };
});
