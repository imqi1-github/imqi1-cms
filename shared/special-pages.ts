/**
 * 后台「页面管理」允许创建的特殊页面 slug 预设。
 *
 * 前台路由约定：
 *   - `/messages`、`/agreement` 由专用页渲染（需存在对应 DB 页面 / 配置）。
 *   - 其余任何 slug（含 custom）落在 `[...slug].vue` 捕获路由 → 前台 404。
 *
 * 只在此维护预设列表与类型；custom 是占位、当前未实现（前台访问返回 404）。
 */
export const SPECIAL_PAGE_OPTIONS = [
  { value: "messages", label: "留言板", implemented: true },
  { value: "agreement", label: "协议", implemented: true },
  { value: "custom", label: "自定义", implemented: false },
] as const;

export type SpecialPageOption = (typeof SPECIAL_PAGE_OPTIONS)[number];
export type SpecialPageValue = SpecialPageOption["value"];

/** 全部合法特殊页面 slug（含未实现的 custom） */
export const SPECIAL_PAGE_SLUGS = new Set<SpecialPageValue>(
  SPECIAL_PAGE_OPTIONS.map(o => o.value),
);

/** 类型收窄：判断某 slug 是否为预设的特殊页面（含 custom） */
export function isSpecialPageSlug(slug: string): slug is SpecialPageValue {
  return (SPECIAL_PAGE_SLUGS as Set<string>).has(slug);
}

/** 已实现的特殊页面 slug 集合（前台真实渲染；custom 未实现，前台访问返回 404） */
export const IMPLEMENTED_SPECIAL_PAGE_SLUGS = new Set<SpecialPageValue>(
  SPECIAL_PAGE_OPTIONS.filter(o => o.implemented).map(o => o.value),
);
