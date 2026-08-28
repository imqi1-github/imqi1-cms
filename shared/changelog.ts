/**
 * 更新日志共享定义（app 与 server 共用）
 *
 * 一条 changelog 记录的 content 是一个条目列表，每个条目：
 *   { type: 更新类别, value: 更新内容（字符串，渲染端走 markdown） }
 *
 * 导入方式参照 #shared/city-coords：
 *   import { CHANGELOG_TYPES, CHANGELOG_META } from "#shared/changelog"
 */

/** 更新类别（顺序也是后台/侧栏的展示顺序） */
export const CHANGELOG_TYPES = [
  "功能",
  "优化",
  "修复",
  "删除",
  "设计",
  "新增",
  "其他",
] as const;

export type ChangelogType = (typeof CHANGELOG_TYPES)[number];

export interface ChangelogEntry {
  type: ChangelogType;
  value: string;
}

/** 类型是否合法 */
export function isChangelogType(value: unknown): value is ChangelogType {
  return typeof value === "string" && (CHANGELOG_TYPES as readonly string[]).includes(value);
}

/**
 * 每个类别对应的展示元数据：
 * - color：Tailwind 类（浅底深字 + 暗色模式）
 * - icon：lucide 图标名
 * - label：徽标上显示的文字
 */
export const CHANGELOG_META: Record<
  ChangelogType,
  { color: string; icon: string; label: string }
> = {
  功能: {
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    icon: "lucide:sparkles",
    label: "功能",
  },
  优化: {
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: "lucide:zap",
    label: "优化",
  },
  修复: {
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    icon: "lucide:bug",
    label: "修复",
  },
  删除: {
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: "lucide:trash-2",
    label: "删除",
  },
  设计: {
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    icon: "lucide:palette",
    label: "设计",
  },
  新增: {
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: "lucide:plus-circle",
    label: "新增",
  },
  其他: {
    color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    icon: "lucide:circle-dashed",
    label: "其他",
  },
};

/** 兜底（未知类型） */
export const CHANGELOG_META_FALLBACK = {
  color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  icon: "lucide:circle-dashed",
  label: "其他",
};

/** 取展示元数据，未知类型回退到「其他」 */
export function getChangelogMeta(type: string) {
  return isChangelogType(type) ? CHANGELOG_META[type] : CHANGELOG_META_FALLBACK;
}
