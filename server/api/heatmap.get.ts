import type { Prisma } from "@prisma/client";

import { prisma } from "#server/utils/prisma";

// 站点统计热力图：按天聚合已发布文章与已审核评论数。
// 可选 category / tag（slug）筛选——文章经 contentrelations→metas 过滤，
// 评论只统计这些文章下的评论，保证「分类/标签视角」口径一致。
export default defineEventHandler(async event => {
  const query = getQuery(event);
  const categorySlug = typeof query.category === "string" && query.category ? query.category : null;
  const tagSlug = typeof query.tag === "string" && query.tag ? query.tag : null;

  const articleWhere: Prisma.contentsWhereInput = { type: 0, status: 1 };
  const relFilters: Prisma.contentsWhereInput[] = [];
  if (categorySlug) {
    relFilters.push({
      contentrelations: { some: { metas: { slug: categorySlug, type: "category" } } },
    });
  }
  if (tagSlug) {
    relFilters.push({
      contentrelations: { some: { metas: { slug: tagSlug, type: "tag" } } },
    });
  }
  if (relFilters.length > 0) articleWhere.AND = relFilters;

  const articles = await prisma.contents.findMany({
    where: articleWhere,
    select: { cid: true, create_time: true },
  });

  // 评论仅统计被筛出的文章下的已审核评论
  let comments: Array<{ create_time: Date }> = [];
  if (articles.length > 0) {
    comments = await prisma.comments.findMany({
      where: {
        status: 1,
        cid: { in: articles.map(article => article.cid) },
      },
      select: { create_time: true },
    });
  }

  // 按本地时区聚合到天
  const pad = (num: number) => String(num).padStart(2, "0");
  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  const days: Record<string, { articles: number; comments: number }> = {};
  const years = new Set<number>();
  const bump = (date: Date, field: "articles" | "comments") => {
    const key = dayKey(date);
    days[key] = days[key] || { articles: 0, comments: 0 };
    days[key][field]++;
    years.add(date.getFullYear());
  };

  for (const article of articles) bump(article.create_time, "articles");
  for (const comment of comments) bump(comment.create_time, "comments");

  return {
    success: true,
    data: {
      totalArticles: articles.length,
      totalComments: comments.length,
      years: Array.from(years).sort((a, b) => b - a),
      days,
    },
  };
});
