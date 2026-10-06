/** 单篇文章的点赞状态响应：count 是文章总点赞数，liked 是当前访客是否已点过 */
export interface LikeStateResponse {
  success: true;
  data: {
    cid: number;
    count: number;
    liked: boolean;
  };
}

/** POST 点赞的响应：失败时 count/liked 取操作前值，方便前端乐观回滚 */
export interface LikeToggleResponse {
  success: true;
  data: {
    cid: number;
    count: number;
    liked: boolean;
    /** true 表示本次请求创建了新点赞，false 表示已存在（重复点击无效） */
    created: boolean;
  };
}