import type { ChangelogType } from "#shared/changelog";

/**
 * 带渲染结果的更新日志条目（前台/admin 列表用）。
 * 与服务端 server/types/utils/rendered-changelog.d.ts 保持一致，
 * 由 renderChangelogEntries / renderChangelogContent 产出。
 */
export interface RenderedChangelogEntry {
  type: ChangelogType;
  value: string;
  html: string;
}
