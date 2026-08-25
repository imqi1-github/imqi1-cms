export interface WaterfallItem {
  url: string;
  title: string;
  desc?: string;
  width?: number | null;
  height?: number | null;
  cid?: number;
  slug?: string;
  categorySlug?: string;
}

export interface Props {
  asLink?: boolean;
  /** 封面懒加载（默认 true，滚动到可见才 fetch/解码；含实况照片） */
  lazy?: boolean;
  items?: WaterfallItem[];
}
