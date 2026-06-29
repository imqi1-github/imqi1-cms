export interface WaterfallItem {
  url: string;
  title: string;
  desc?: string;
  cid?: number;
  slug?: string;
  categorySlug?: string;
}

export interface Props {
  asLink?: boolean;
  items?: WaterfallItem[];
}