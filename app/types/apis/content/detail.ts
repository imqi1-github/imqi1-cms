/** 文章详情页响应：服务端在 [slug].get.ts 里逐字段白名单构造的 data 形状 */
export interface ContentDetailData {
  cid: number;
  title: string;
  desc: string | null;
  create_time: string;
  update_time: string;
  many_covers: boolean;
  show_toc: boolean;
  user: {
    uid: number;
    name: string;
    nickname: string | null;
    avatar: string | null;
  };
  travels: Array<{ id: number; name: string }>;
  contentrelations: Array<{
    cid: number;
    mid: number;
    metas: {
      mid: number;
      name: string;
      slug: string | null;
      type: string;
    };
  }>;
  covers: Array<{
    url: string;
    desc?: string;
    width?: number;
    height?: number;
  }>;
  tags: Array<{ name: string; slug: string | null }>;
  markdownImages: Array<{ url: string; width: number | null; height: number | null }>;
  parsedCovers: Array<{
    url: string;
    desc?: string;
    width?: number;
    height?: number;
  }>;
  renderedContent: string;
  likeCount: number;
}

export interface ContentDetailResponse {
  success: true;
  data: ContentDetailData;
}