import type { RenderedChangelogEntry } from "~/types/pages/admin/changelogs";
import type { ChangelogType } from "~~/shared/changelog";

export interface ChangelogItem {
  id: number;
  content: RenderedChangelogEntry[];
  createTime: string; // Prisma DateTime，经 Nitro 序列化为 string
}

/** 编辑表单条目：带稳定 _key 供 v-for 使用（用 index 作 key 会在增删时串行错位） */
export interface FormEntry {
  _key: number;
  type: ChangelogType;
  value: string;
}