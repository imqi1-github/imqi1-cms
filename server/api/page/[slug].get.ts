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
  // 仅 select 前端展示所需字段：原 ...page 会泄露 status / type / 原始 content /
  // comment_num / show_toc / tags / uid / 时间等内部与隐私字段。
  const page = await prisma.contents.findFirst({
    where: {
      slug,
      type: 1, // 1: 页面
      status: 1, // 只返回已发布的
    },
    select: {
      title: true,
      desc: true,
      content: true, // 仅服务端用于渲染，不回传
    },
  });

  if (!page) {
    throw createError({
      statusCode: 404,
      message: "页面不存在",
    });
  }

  // 在服务端渲染 Markdown 内容
  const renderedContent = page.content ? await renderMarkdown(page.content) : "";

  return {
    success: true,
    data: {
      title: page.title,
      desc: page.desc,
      renderedContent,
    },
  };
});
