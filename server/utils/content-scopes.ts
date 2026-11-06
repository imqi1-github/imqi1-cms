/**
 * 内容更新 → 影响面（scope）判定。
 *
 * 独立成文件的原因：单测大量 `mock.module("#server/utils/content-cache")` 只提供
 * invalidateContentCaches —— 新导出挂在那个模块上会让那些用例直接 SyntaxError
 * （导出对不上）。
 */
import type { ContentScope } from "#server/types/utils/content-cache";

/**
 * 本次更新实际影响了哪些展示面（决定边缘刷哪些页面）。
 *
 * - 只改正文 → 只刷文章页：列表卡片上的日期是相对时间（hydration 后客户端自纠正），
 *   正文也不出现在任何卡片上 → 其余页面一个字节都不会变。
 * - 改标题/摘要/封面 → 卡片上显示着这些字段 → 所有显示卡片的地方 + 引用它的「相关文章」卡片都要刷。
 * - 改 slug → 文章 URL 变了 → 卡片上的**链接**变了 → 显示卡片的地方 + 引用它的页都要刷。
 * - 改发布状态/创建时间 → 文章进出列表、列表排序变化 → 后续页码位移 → 刷列表目录。
 * - 改类型 → 文章与独立页面互换 → 进出列表（页码位移）+ 独立页的固定页要刷。
 */
export function contentUpdateScopes(
  existing: { title: string; desc: string | null; slug: string | null; covers: unknown; many_covers: boolean | null; status: number; type: number; create_time: Date | null },
  next: { title?: unknown; desc?: unknown; slug?: unknown; covers?: unknown; manyCovers?: unknown; statusNum?: number; typeNum?: number; publishDate?: unknown },
): ContentScope[] {
  const scopes = new Set<ContentScope>(["article"]);
  const changed = (before: unknown, after: unknown): boolean =>
    after !== undefined && after !== null && before !== after;

  if (changed(existing.title, next.title)
    || changed(existing.desc, next.desc)
    || changed(existing.covers, next.covers)
    || changed(existing.many_covers, next.manyCovers)) {
    scopes.add("card");
    scopes.add("related");
  }
  // 改 slug → 卡片上的链接变了（列表页/首页/归档/站点地图 + 别人的「相关文章」卡片）
  if (changed(existing.slug, next.slug)) {
    scopes.add("card");
    scopes.add("related");
  }
  if (next.statusNum !== undefined && next.statusNum !== existing.status) {
    scopes.add("card");
    scopes.add("listDir");
  }
  if (next.publishDate && existing.create_time && new Date(next.publishDate as string).getTime() !== existing.create_time.getTime()) {
    scopes.add("card");
    scopes.add("listDir");
  }
  // 改类型 → 文章与独立页面互换：进出文章列表（页码位移）+ 独立页那几个固定页
  if (next.typeNum !== undefined && next.typeNum !== existing.type) {
    scopes.add("card");
    scopes.add("listDir");
    scopes.add("fixed");
  }
  return [...scopes];
}
