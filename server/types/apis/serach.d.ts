// 搜索结果文章类型（对应 findMany select 字段）
export interface SearchContentItem {
  cid: number;
  title: string;
  create_time: Date;
  slug: string | null;
  desc: string | null;
  content: string | null;
  contentrelations: {
      metas: {
          name: string;
          slug: string | null;
      };
  }[];
}
