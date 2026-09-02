/**
 * API Schema 定义集合
 * 这里定义所有 API 共享的 Zod Schema
 */

import { z } from "zod";

// 搜索类别：文章 / 订阅和友链 / 评论 / 订阅文章
export const SearchTypeSchema = z.enum(["content", "subscribe", "comment", "subscribepost"]);

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  type: SearchTypeSchema.default("content"),
});

// 文章搜索结果项
export const SearchResultItemSchema = z.object({
  type: z.literal("content"),
  cid: z.number(),
  title: z.string(),
  // 实际 formatSearchResults 返回的 slug 可能为 null，与现实对齐（防未来启用响应校验时误 500）
  slug: z.string().nullable(),
  desc: z.string().nullable(),
  createTime: z.date().or(z.string()),
  categoryName: z.string().nullable(),
  categorySlug: z.string().nullable(),
  highlight: z.string().optional(),
});

// 订阅源 / 友链搜索结果项（kind 区分来源）
export const SubscribeSearchItemSchema = z.object({
  type: z.literal("subscribe"),
  kind: z.enum(["subscribe", "link"]),
  id: z.number(),
  name: z.string(),
  url: z.string(),
  desc: z.string().nullable(),
  avatar: z.string().nullable(),
});

// 评论搜索结果项（白名单字段，附文章上下文）
export const CommentSearchItemSchema = z.object({
  type: z.literal("comment"),
  coid: z.number(),
  name: z.string(),
  content: z.string(),
  avatar: z.string(),
  createTime: z.date().or(z.string()),
  articleTitle: z.string().nullable(),
  articleUrl: z.string().nullable(),
});

// 订阅文章搜索结果项（RSS 订阅抓取的文章）
export const SubscribePostSearchItemSchema = z.object({
  type: z.literal("subscribepost"),
  id: z.number(),
  subscribeId: z.number(),
  subscribeName: z.string(),
  subscribeAvatar: z.string().nullable(),
  title: z.string(),
  link: z.string(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  pubDate: z.date().or(z.string()).nullable(),
});

export const SearchResponseSchema = z.object({
  results: z.array(z.union([SearchResultItemSchema, SubscribeSearchItemSchema, CommentSearchItemSchema, SubscribePostSearchItemSchema])),
  total: z.number(),
  query: z.string(),
  type: SearchTypeSchema,
});

// ============= 评论 Schema =============

export const CommentCreateSchema = z.object({
  csrfToken: z.string(),
  cid: z.coerce.number().int().positive(),
  content: z.string().min(1).max(5000),
  name: z.string().min(1).max(50),
  mail: z
    .string()
    .optional()
    .nullable()
    .transform(v => (v === "" ? null : v)),
  link: z
    .string()
    .optional()
    .nullable()
    .transform(v => (v === "" ? null : v)),
  parent_id: z.coerce.number().int().optional().nullable(),
  website: z.string().optional(), // 蜜罐字段：人类不会填写，机器人会自动填充
  captcha: z.string().optional(), // 图形验证码（未登录用户必填，登录用户可不带）
});

// 提交评论后仅回传新评论的 coid，不下发 mail/ip/agent 等隐私字段
export const CommentItemSchema = z.object({
  coid: z.number(),
});

// ============= 站点设置 Schema =============

export const SiteSettingsSchema = z.object({
  siteName: z.string(),
  siteUrl: z.string(),
  siteDesc: z.string(),
  siteIcp: z.string(),
  homeCustomText: z.string(),
  photoCategorySlug: z.string(),
  commentEnabled: z.boolean(),
  commentAvatarService: z.string(),
  commentPageSize: z.number(),
  commentMaxLevel: z.number(),
  commentInterval: z.number(),
  commentRequireMail: z.boolean(),
  commentRequireLink: z.boolean(),
  contentPageSize: z.number(),
  feedCacheInterval: z.number(),
  linkAutoApprove: z.boolean(),
  musicPlaylistId: z.string(),
});
