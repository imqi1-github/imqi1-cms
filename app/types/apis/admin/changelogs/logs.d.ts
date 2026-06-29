import type { RenderedChangelogEntry } from "~/types/pages/admin/changelogs";

export interface ChangelogItem {
  id: number;
  content: RenderedChangelogEntry[];
  createTime: Date;
}