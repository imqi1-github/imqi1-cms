export interface MiniLatestPost {
  id: number;
  title: string;
  cover: string;
  publishedAt: string;
  created: string;
}

export interface MiniLatestPostsResponse {
  success: true;
  data: MiniLatestPost[];
}
