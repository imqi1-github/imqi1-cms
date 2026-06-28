/**
 * 评论 API 相关类型定义
 */

import type { CommentWithChildren } from "../components/comment";

/** 评论提交 API 响应 */
export interface CommentSubmitResponse {
  code: number;
  message: string;
  data: CommentWithChildren | null;
  needModeration: boolean;
  auditResult: unknown | null;
}

/** 提交评论请求体 */
export interface CommentSubmitBody {
  csrfToken: string;
  cid: number;
  content: string;
  name: string;
  mail: string;
  link: string;
  parent_id: number | null;
  website: string; // 蜜罐字段
  captcha?: string; // 图形验证码
}