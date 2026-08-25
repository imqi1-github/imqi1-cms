import type { ChangelogType } from "~~/shared/changelog";

// 公开接口条目：只含 type + html（不含 value——markdown 源码前台不用，属冗余传输）
export interface ChangelogContentEntry {
  type: ChangelogType;
  html: string;
}

// 解析后的单条更新日志
export interface ChangelogEntry {
  id: number;
  content: ChangelogContentEntry[];
  createTime: Date;
}

// 按月分组后的结构
export interface ChangelogGroup {
  year: number;
  month: number;
  logs: ChangelogEntry[];
}
