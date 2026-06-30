/**
 * 评论组件类型定义
 */
import type { CommentNode } from "~/types/apis/comments";

/** 评论数据（从 API 返回类型自动推导，Date 字段已序列化为 string） */
export type Comment = CommentNode;

/** 回复状态 */
export interface ReplyState {
  isReplying: boolean;
  replyTo: { id: number; name: string } | null;
  targetCommentId: number | null;
}

/** 评论表单数据 */
export interface CommentFormData {
  content: string;
  name: string;
  mail: string;
  link: string;
}
