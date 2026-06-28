// 解析后的单条更新日志
export interface ChangelogEntry {
  id: number;
  content: RenderedChangelogEntry[];
  createTime: Date;
}

// 按月分组后的结构
export interface ChangelogGroup {
  year: number;
  month: number;
  logs: ChangelogEntry[];
}
