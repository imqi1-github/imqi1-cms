import { prisma } from "#server/utils/prisma";
import type { ContentUrlRow } from "#server/types/utils/content-cache";

/** 枚举出来的具体 URL 超过这个数就退回目录刷新（避免一次分类变更吃掉上千 URL 额度） */
export const PURGE_CONTENT_URL_LIMIT = 200;

/** 从一条内容记录生成受影响的站内路径（文章页/分类页/标签页；独立页面为 `/<slug>`） */
export function contentUrlPaths(row: ContentUrlRow): string[] {
  const slug = row.slug ?? String(row.cid);
  const relations = row.contentrelations ?? [];
  const categorySlugs = relations
    .filter(relation => relation?.metas?.type === "category")
    .map(relation => relation.metas.slug)
    .filter((value): value is string => Boolean(value));
  const tagSlugs = relations
    .filter(relation => relation?.metas?.type === "tag")
    .map(relation => relation.metas.slug)
    .filter((value): value is string => Boolean(value));

  const paths: string[] = [];
  if (row.type === 1) {
    paths.push(`/${encodeURIComponent(slug)}`);
  } else {
    for (const categorySlug of categorySlugs.length ? categorySlugs : ["uncategorized"]) {
      paths.push(`/content/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`);
    }
  }
  for (const categorySlug of categorySlugs) paths.push(`/category/${encodeURIComponent(categorySlug)}`);
  for (const tagSlug of tagSlugs) paths.push(`/tag/${encodeURIComponent(tagSlug)}`);
  return paths;
}

/**
 * 查询分类/标签下所有内容的受影响路径（删除/重命名前调用）。
 * 关联文章太多时返回空数组，让刷新侧退回目录刷新。
 */
export async function metaContentPaths(mid: number, pagePath?: string | null): Promise<string[]> {
  const total = (await prisma.contentrelations.count({ where: { mid } })) ?? 0;
  if (total > PURGE_CONTENT_URL_LIMIT) return [];

  const relations = (await prisma.contentrelations.findMany({
    where: { mid },
    select: {
      content: {
        select: {
          cid: true,
          slug: true,
          type: true,
          contentrelations: { select: { metas: { select: { slug: true, type: true } } } },
        },
      },
    },
  })) ?? [];

  const paths = new Set<string>();
  for (const relation of relations) {
    if (!relation?.content) continue;
    for (const path of contentUrlPaths(relation.content)) paths.add(path);
  }
  if (pagePath) paths.add(pagePath);
  return [...paths];
}
