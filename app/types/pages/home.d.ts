import type { GridItem } from "~/types/apis";

/** 首页「样式主题」说明卡片：grid 类展示格子列表，content 类展示正文 */
export interface ThemeCardItem {
  title: string;
  type: "grid" | "content";
  grids?: GridItem[];
  content?: string;
}
