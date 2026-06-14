import { prisma } from "#server/utils/prisma";
import { renderMarkdown } from "#server/utils/markdown";

export default defineEventHandler(async event => {
  const slug = getRouterParam(event, "slug");

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "页面 slug 不能为空",
    });
  }

  // 查询页面 (type: 1 = 页面)
  const page = await prisma.posts.findFirst({
    where: {
      slug,
      type: 1, // 1: 页面
      status: 1, // 只返回已发布的
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
    },
  });

  if (!page) {
    throw createError({
      statusCode: 404,
      message: "页面不存在",
    });
  }

  // 解析封面
  let covers: Array<{ url: string; desc: string }> = [];
  if (page.covers) {
    try {
      const parsed = JSON.parse(page.covers);
      if (Array.isArray(parsed)) {
        covers = parsed.map((item: any) => ({
          url: item.url || item,
          desc: item.title || item.desc || '',
        }));
      }
    } catch {
      covers = [];
    }
  }

  // 在服务端渲染 Markdown 内容
  const renderedContent = page.content ? await renderMarkdown(page.content) : "";

  return {
    success: true,
    data: {
      ...page,
      covers,
      renderedContent,
    },
  };
});
