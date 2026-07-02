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
  items?: WaterfallItem[];
}
