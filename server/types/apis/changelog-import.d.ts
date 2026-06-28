import type { ChangelogEntry } from "~~/shared/changelog";

/** JSON 输入格式（支持两种形态） */
export type ChangelogInputJson = ChangelogEntry[] | ChangelogInputRecord[] | ChangelogInputRecord;

/** 单条记录格式 */
export interface ChangelogInputRecord {
  entries: ChangelogEntry[];
  createTime?: string;
}

/** 解析后的记录格式 */
export interface ParsedRecord {
  entries: ChangelogEntry[];
  createTime?: string;
}
