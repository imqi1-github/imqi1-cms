export interface ChangelogEntry {
  type: string;
  value: string;
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