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

// ============ 各类型搜索结果项 ============

// 文章搜索结果项
export interface ContentSearchResult {
  type: "content";
  cid: number;
  title: string;
  slug: string | null;
  desc: string | null;
  createTime: Date;
  categoryName: string | null;
  categorySlug: string | null;
  // 正文高亮摘要
  highlight: string;
}

// 订阅源 / 友链搜索结果项（kind 区分来源）
export interface SubscribeSearchResult {
  type: "subscribe";
  kind: "subscribe" | "link";
  id: number;
  name: string;
  url: string;
  desc: string | null;
  avatar: string | null;
}

// 评论搜索结果项（白名单字段，附文章上下文）
export interface CommentSearchResult {
  type: "comment";
  coid: number;
  name: string;
  content: string;
  avatar: string;
  createTime: Date;
  articleTitle: string | null;
  articleUrl: string | null;
}

// 订阅文章搜索结果项（RSS 订阅抓取的文章）
export interface SubscribePostSearchResult {
  type: "subscribepost";
  id: number;
  subscribeId: number;
  subscribeName: string;
  subscribeAvatar: string | null;
  title: string;
  link: string;
  description: string | null;
  author: string | null;
  pubDate: Date | null;
}

// 单个搜索分支（文章/订阅+友链/评论/订阅文章）的结果
export type SearchBranchResult = {
  results: (ContentSearchResult | SubscribeSearchResult | CommentSearchResult | SubscribePostSearchResult)[];
  total: number;
};
