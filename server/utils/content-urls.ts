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

/** 相关文章反查要用的关系字段（contentArticlePaths 只消费 metas 的 slug/type） */
const contentrelationsSelect = {
  select: { metas: { select: { mid: true, slug: true, type: true } } },
} as const;

/** 相关文章候选池大小：必须与 `/api/related-contents` 的 candidateLimit 口径一致（max(limit*4, 20)） */
const RELATED_POOL_LIMIT = 20;
/** 文章页请求相关文章时带的条数：与 `[slug].vue` 的 `?limit=3` 一致 */
const RELATED_TAKE = 3;
/** 共享标签的文章超过这个数就不做反查（退化为靠边缘短 TTL / 自然过期收敛） */
const RELATED_REFRESH_CANDIDATE_CAP = 200;
/** 单次批量删除超过这个篇数就不逐篇反查（每篇要模拟一次排序，代价随篇数线性涨） */
export const RELATED_REFRESH_BATCH_CAP = 20;

/** 文章当前的标签 mid（相关文章反查用） */
export async function contentTagMids(cid: number): Promise<number[]> {
  const row = await prisma.contents.findUnique({
    where: { cid },
    select: {
      contentrelations: {
        where: { metas: { type: "tag" } },
        select: { metas: { select: { mid: true } } },
      },
    },
  });
  return (row?.contentrelations ?? []).map(relation => relation.metas.mid);
}

/**
 * 会把 `cid` 列进「相关文章」的**其他文章页**路径。
 *
 * 文章页 SSR 内嵌相关文章卡片（标题/封面/日期/链接），所以这篇文章改名、改封面、
 * 改标签、取消发布或删除后，别人页上的卡片就是旧的（内容页边缘 TTL 6 小时）。
 * 这里按 `/api/related-contents` 的同一套排序规则反查，精确到真正会展示它的那几页
 * （实测本库平均 8.5 页、最多 24 页），避免整组 `/content/**` 回源重渲染。
 *
 * 传入 `tagMids` 而非现查：更新接口要在**写库后**用新标签算，删除接口要在**删除前**算。
 */
export async function relatedContentPagePaths(cid: number, tagMids: number[]): Promise<string[]> {
  const mids = [...new Set(tagMids)];
  if (!mids.length) return [];

  // 候选：与这篇文章共享标签的已发布文章 —— 只有它们才可能把 cid 排进自己的相关文章
  const candidates = await prisma.contents.findMany({
    where: {
      cid: { not: cid },
      type: 0,
      status: 1,
      slug: { not: null },
      contentrelations: { some: { mid: { in: mids } } },
    },
    select: {
      cid: true,
      slug: true,
      type: true,
      create_time: true,
      contentrelations: contentrelationsSelect,
    },
    take: RELATED_REFRESH_CANDIDATE_CAP + 1,
  });
  if (!candidates.length || candidates.length > RELATED_REFRESH_CANDIDATE_CAP) return [];

  // 候选文章各自的标签 → 每个标签「最近 20 篇」是相关候选池的组成单元（并集再取 20 即真实候选池）
  const candidateTagMids = new Set<number>();
  for (const row of candidates) {
    for (const relation of row.contentrelations) {
      if (relation.metas.type === "tag") candidateTagMids.add(relation.metas.mid);
    }
  }
  const perTagPools = new Map<number, Set<number>>();
  for (const mid of candidateTagMids) {
    const rows = await prisma.contents.findMany({
      where: { type: 0, status: 1, slug: { not: null }, contentrelations: { some: { mid } } },
      select: { cid: true },
      orderBy: { create_time: "desc" },
      take: RELATED_POOL_LIMIT,
    });
    perTagPools.set(mid, new Set(rows.map(row => row.cid)));
  }

  // 候选池里的文章可能不在 candidates 里（来自候选文章的其他标签），补一次字段。
  // 注意：cid 自己也要留在池里 —— 它正是要判断「是否被排进对方 top3」的那一篇。
  const poolCids = new Set<number>();
  for (const pool of perTagPools.values()) {
    for (const poolCid of pool) poolCids.add(poolCid);
  }
  const poolRows = poolCids.size
    ? await prisma.contents.findMany({
      where: { cid: { in: [...poolCids] } },
      select: { cid: true, slug: true, type: true, create_time: true, contentrelations: contentrelationsSelect },
    })
    : [];
  const poolById = new Map(poolRows.map(row => [row.cid, row]));

  const tagMidsOf = (row: typeof poolRows[number]): number[] =>
    row.contentrelations.filter(relation => relation.metas.type === "tag").map(relation => relation.metas.mid);

  const pages = new Set<string>();
  for (const candidate of candidates) {
    const candidateTags = tagMidsOf(candidate);
    if (!candidateTags.length) continue;

    // 候选池 = 本例标签池的并集按时间取前 20（与 API 的 orderBy create_time desc take 20 等价）
    const pool = new Set<number>();
    for (const mid of candidateTags) {
      for (const poolCid of perTagPools.get(mid) ?? []) {
        if (poolCid !== candidate.cid) pool.add(poolCid);
      }
    }
    const ranked = [...pool]
      .map(poolCid => poolById.get(poolCid))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.create_time.getTime() - a.create_time.getTime())
      .slice(0, RELATED_POOL_LIMIT)
      .map(row => ({
        row,
        relevance: candidateTags.filter(mid => tagMidsOf(row).includes(mid)).length,
      }))
      .sort((a, b) => (b.relevance - a.relevance) || (b.row.create_time.getTime() - a.row.create_time.getTime()))
      .slice(0, RELATED_TAKE);

    if (ranked.some(item => item.row.cid === cid)) {
      for (const path of contentArticlePaths(candidate)) pages.add(path);
    }
  }
  return [...pages];
}

/** 计算位次所需的文章字段（要比 ContentUrlRow 多 create_time 与分类/标签的 mid） */
export interface ListPositionRow {
  cid: number;
  create_time: Date;
  contentrelations: { metas: { mid: number; slug: string | null; type: string } }[];
}

/** 失效计算共用的文章行：文章路径 + 位次计算一次查出来 */
export interface ContentRow extends ListPositionRow {
  slug: string | null;
  type: number;
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
