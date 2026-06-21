/**
 * API Schema 定义集合
 * 这里定义所有 API 共享的 Zod Schema
 */

import { z } from "zod";

// ============= 通用响应 Schema =============

export const SuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  code: z.number().optional(),
});

export const StandardResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    code: z.number().default(200),
    message: z.string(),
    data: dataSchema,
  });

// ============= 分页 Schema =============

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const PaginationResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  });

// ============= 搜索 Schema =============

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export const SearchResultItemSchema = z.object({
  cid: z.number(),
  title: z.string(),
  slug: z.string(),
  desc: z.string().nullable(),
  createTime: z.date().or(z.string()),
  categoryName: z.string().nullable(),
  categorySlug: z.string().nullable(),
  highlight: z.string().optional(),
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultItemSchema),
  total: z.number(),
  query: z.string(),
});

// ============= 评论 Schema =============

export const CommentCreateSchema = z.object({
  csrfToken: z.string(),
  cid: z.coerce.number().int().positive(),
  content: z.string().min(1).max(5000),
  name: z.string().min(1).max(50),
  mail: z.string().optional().nullable().transform(v => (v === "" ? null : v)),
  link: z.string().optional().nullable().transform(v => (v === "" ? null : v)),
  parent_id: z.coerce.number().int().optional().nullable(),
  website: z.string().optional(), // 蜜罐字段：人类不会填写，机器人会自动填充
});

export const CommentItemSchema = z.object({
  coid: z.number(),
  cid: z.number(),
  content: z.string(),
  name: z.string(),
  mail: z.string().nullable(),
  link: z.string().nullable(),
  parent_id: z.number().nullable(),
  status: z.number(),
  create_time: z.date().or(z.string()),
  agent: z.string().nullable(),
  ip: z.string().nullable(),
});

export const CommentListQuerySchema = z.object({
  cid: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
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
  postPageSize: z.number(),
  feedCacheInterval: z.number(),
  linkAutoApprove: z.boolean(),
});

export const SiteSettingsResponseSchema = z.object({
  success: z.boolean(),
  data: SiteSettingsSchema,
});

// ============= 文章 Schema =============

export const PostItemSchema = z.object({
  cid: z.number(),
  title: z.string(),
  slug: z.string(),
  desc: z.string().nullable(),
  content: z.string().optional(),
  create_time: z.date().or(z.string()),
  update_time: z.date().or(z.string()).nullable(),
  status: z.number(),
  type: z.number(),
  comment_num: z.number().optional(),
});

export const PostDetailSchema = PostItemSchema.extend({
  content: z.string(),
  category: z
    .object({
      mid: z.number(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
  tags: z.array(
    z.object({
      mid: z.number(),
      name: z.string(),
      slug: z.string(),
    }),
  ),
});

// ============= 分类 Schema =============

export const CategorySchema = z.object({
  mid: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  count: z.number().optional(),
});

export const CategoryListSchema = z.array(CategorySchema);

// ============= 标签 Schema =============

export const TagSchema = z.object({
  mid: z.number(),
  name: z.string(),
  slug: z.string(),
  count: z.number().optional(),
});

export const TagListSchema = z.array(TagSchema);

// ============= 友情链接 Schema =============

export const LinkCreateSchema = z.object({
  name: z.string().min(1).max(50),
  link: z.string().url(),
  desc: z.string().max(200).optional(),
  avatar: z.string().url().optional(),
});

export const LinkItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  link: z.string(),
  desc: z.string().nullable(),
  avatar: z.string().nullable(),
  enabled: z.boolean(),
});

// ============= 归档 Schema =============

export const ArchiveYearSchema = z.object({
  year: z.number(),
  count: z.number(),
  months: z.array(
    z.object({
      month: z.number(),
      count: z.number(),
      posts: z.array(
        z.object({
          cid: z.number(),
          title: z.string(),
          slug: z.string(),
          day: z.number(),
        }),
      ),
    }),
  ),
});

export const ArchivingResponseSchema = z.object({
  archives: z.array(ArchiveYearSchema),
  total: z.number(),
});

// ============= 首页数据 Schema =============

export const HomeDataSchema = z.object({
  featuredPosts: z.array(PostItemSchema).optional(),
  recentPosts: z.array(PostItemSchema),
  categories: z.array(CategorySchema),
  stats: z.object({
    postsCount: z.number(),
    commentsCount: z.number(),
    tagsCount: z.number(),
    categoriesCount: z.number(),
  }),
});

// ============= 随机文章 Schema =============

export const RandomPostSchema = z.object({
  cid: z.number(),
  title: z.string(),
  slug: z.string(),
});

export const RandomPostsResponseSchema = z.array(RandomPostSchema);

// ============= 相关文章 Schema =============

export const RelatedPostsResponseSchema = z.array(
  z.object({
    cid: z.number(),
    title: z.string(),
    slug: z.string(),
    desc: z.string().nullable(),
  }),
);

// ============= 订阅文章 Schema =============

export const SubscribePostSchema = z.object({
  id: z.number(),
  title: z.string(),
  link: z.string(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  pubDate: z.string().nullable(),
  feedId: z.number(),
});

export const SubscribePostsResponseSchema = z.array(SubscribePostSchema);

// ============= 统计数据 Schema =============

export const StatsResponseSchema = z.object({
  postsCount: z.number(),
  commentsCount: z.number(),
  tagsCount: z.number(),
  categoriesCount: z.number(),
  linksCount: z.number(),
  subscribesCount: z.number(),
});

export type StandardResponse<T> = {
  code: number;
  message: string;
  data: T;
};
