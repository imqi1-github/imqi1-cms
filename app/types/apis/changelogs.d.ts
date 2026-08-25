// /api/changelogs 公开接口只下发 type + html，不返回 value（markdown 源码，前台不用，属冗余传输）
export interface ChangelogEntry {
  type: string;
  html: string;
}

interface ChangelogLog {
  id: number;
  content: ChangelogEntry[];
  createTime: string | Date;
}

export interface ChangelogGroup {
  year: number;
  month: number;
  logs: ChangelogLog[];
}