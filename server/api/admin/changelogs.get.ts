import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import MarkdownIt from "markdown-it";

// 创建简化版 Markdown 实例（仅支持基础格式）
const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: true,
});

// 渲染 Markdown 为 HTML
function renderMarkdown(content: string): string {
  if (!content) {
    return "";
  }
  return md.render(content);
}

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
    const changelogs = await prisma.changelogs.findMany({
      orderBy: { create_time: "desc" },
    });

    // 渲染 Markdown 内容为 HTML
    return changelogs.map(log => ({
      ...log,
      descHtml: renderMarkdown(log.desc || ""),
    }));
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取更新日志失败",
    });
  }
});
