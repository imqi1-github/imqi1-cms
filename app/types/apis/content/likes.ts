export type {
  LikeStateResponse,
  LikeToggleResponse,
} from "#server/types/apis/content/likes";

/** useContentLike composable 暴露给消费者的内部状态 */
export interface ContentLikeState {
  /** 文章总点赞数（含其他访客） */
  count: number;
  /** 当前访客是否已点过（服务端指纹 + 本地 localStorage 双确认） */
  liked: boolean;
  /** 点赞请求进行中（按钮防抖用） */
  pending: boolean;
  /** 最近一次错误（toast/降级展示用） */
  error: string | null;
}