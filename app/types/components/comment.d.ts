/**
 * 评论组件类型定义
 */
import type { comments } from ".prisma/client";

/** 评论状态枚举 */
export type CommentStatus = 0 | 1; // 0: 待审核, 1: 已通过

/** 评论数据（基础字段） */
export type Comment = comments;

/** 评论数据（扩展字段，用于 CommentItem 组件） */
export interface CommentWithChildren extends Comment {
  parent_name?: string;
  location?: string;
  isp?: string;
  children?: CommentWithChildren[];
}

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
