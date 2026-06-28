import type { ChangelogType } from "#shared/changelog";

/** 带渲染结果的对外条目 */
export interface RenderedChangelogEntry {
  type: ChangelogType;
  value: string;
  html: string;
}
