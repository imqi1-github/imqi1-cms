import { prisma } from "#server/utils/prisma";
import type { ContentUrlRow } from "#server/types/utils/content-cache";

/** 枚举出来的具体 URL 超过这个数就退回目录刷新（避免一次分类变更吃掉上千 URL 额度） */
export const PURGE_CONTENT_URL_LIMIT = 200;

/** 从一条内容记录生成受影响的站内路径（文章页/分类页/标签页；独立页面为 `/<slug>`） */
export function contentUrlPaths(row: ContentUrlRow): string[] {
  return [...contentArticlePaths(row), ...contentTaxonomyPaths(row)];
}

/** 只取内容自身的路径（文章页/独立页），不含分类页与标签页 */
export function contentArticlePaths(row: ContentUrlRow): string[] {
  const slug = row.slug ?? String(row.cid);
  if (row.type === 1) return [`/${encodeURIComponent(slug)}`];
  const categorySlugs = categoryAndTagSlugs(row, "category");
  const paths: string[] = [];
  for (const categorySlug of categorySlugs.length ? categorySlugs : ["uncategorized"]) {
    paths.push(`/content/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`);
  }
  return paths;
}

/** 只取分类页与标签页路径 */
export function contentTaxonomyPaths(row: ContentUrlRow): string[] {
  const paths: string[] = [];
  for (const categorySlug of categoryAndTagSlugs(row, "category")) {
    paths.push(`/category/${encodeURIComponent(categorySlug)}`);
  }
  for (const tagSlug of categoryAndTagSlugs(row, "tag")) {
    paths.push(`/tag/${encodeURIComponent(tagSlug)}`);
  }
  return paths;
}

function categoryAndTagSlugs(row: ContentUrlRow, type: "category" | "tag"): string[] {
  const relations = row.contentrelations ?? [];
  return relations
    .filter(relation => relation?.metas?.type === type)
    .map(relation => relation.metas.slug)
    .filter((value): value is string => Boolean(value));
}

/**
 * 查询分类/标签下所有内容的受影响路径（删除/重命名前调用）。
 * 关联文章太多时返回 null，让刷新侧退回目录刷新（此时调用方不要再补单条路径，
 * 否则目录兜底会被跳过 → 旧 URL 留着不刷）。
 */
export async function metaContentPaths(mid: number, pagePath?: string | null): Promise<string[] | null> {
  const total = (await prisma.contentrelations.count({ where: { mid } })) ?? 0;
  if (total > PURGE_CONTENT_URL_LIMIT) return null;

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

/** 计算位次所需的文章字段（要比 ContentUrlRow 多 create_time 与分类/标签的 mid） */
export interface ListPositionRow {
  cid: number;
  create_time: Date;
  contentrelations: { metas: { mid: number; slug: string | null; type: string } }[];
}

/**
 * 文章在它所属分类/标签列表里**所在那一页**的路径。
 *
 * 列表按 `content.create_time desc` 排序、每页 pageSize 条 ⇒ 一篇文章只出现在一页上，
 * 位次 = 「同分类/标签里 create_time 更晚的文章数 + 1」→ 页码 = ⌈位次 / pageSize⌉。
 * 算出这一页就能**精确刷新**它，不必刷整个目录（分页变体无限，目录额度又只有 50/天）。
 *
 * 第 1 页返回裸路径（与 `?page=1` 等价，规范化跳转会把 `?page=1` 折成裸路径）。
 *
 * 注意：同 create_time 并列时两条记录的先后未定义，位次可能差 1 → 刷到的页可能不是它真正所在那页，
 * 这种情况由列表页的短 TTL 兜底（≤15 秒）。
 */
export async function contentListPagePaths(rows: ListPositionRow[], pageSize: number): Promise<string[]> {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const paths = new Set<string>();
  for (const row of rows) {
    for (const relation of row.contentrelations ?? []) {
      const meta = relation.metas;
      if (!meta?.mid || !meta.slug) continue;
      const later = await prisma.contents.count({
        where: {
          type: 0,
          status: 1,
          create_time: { gt: row.create_time },
          contentrelations: { some: { mid: meta.mid } },
        },
      });
      const page = Math.ceil((later + 1) / size);
      const kind = meta.type === "category" ? "category" : "tag";
      const path = `/${kind}/${encodeURIComponent(meta.slug)}`;
      paths.add(page <= 1 ? path : `${path}?page=${page}`);
    }
  }
  return [...paths];
}
