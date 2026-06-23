/**
 * 自动生成的 API 类型定义
 * 此文件由 scripts/generate-api-types.ts 自动生成，请勿手动修改！
 *
 * 包含 101 个 API 端点
 * 已类型化: 3 个端点
 *
 * 使用方式:
 * ```ts
 * import type { ApiTypes } from "~~/shared/api-types.generated";
 *
 * // 获取响应类型
 * type SearchResponse = ApiTypes["/search"]["get"]["response"];
 *
 * // 获取请求体类型
 * type CommentBody = ApiTypes["/comments/index"]["post"]["body"];
 * ```
 */

/**
 * API 接口类型映射
 * 结构: ApiTypes[路径][方法] = { query, body, response }
 */
export interface ApiTypes {
  "/admin/attachments/all": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/attachments/:id/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    patch: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/categories/create": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/categories/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/categories": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/changelogs/import": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/changelogs/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/changelogs/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/comments/batch-delete": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/comments/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    patch: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/comments": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/detailed-stats": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/links/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/links/:id/approve-modification": {
    patch: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/links/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    patch: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/links/:id/toggle": {
    patch: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/mail/test": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/pages": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/popular-posts": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/post-categories/:id/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/post-tags/:id/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/posts/batch-delete": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/posts/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/posts/:cid/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    get: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/recent-comments": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/recent-posts": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/settings/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/settings/init": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/stats": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/subscribes/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/subscribes/update": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/subscribes/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/system-info": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/tags/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/tags/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/travels/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/travels/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/users/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/admin/users/:id/index": {
    delete: {
      query: any;
      body: any;
      response: any;
    };

    get: {
      query: any;
      body: any;
      response: any;
    };

    put: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/archiving": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/attachments/list": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/attachments/upload": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/attachments/:id": {
    delete: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/auth/login": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/auth/logout": {
    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/auth/me": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/auth/verify": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/blog-network/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/captcha/image": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/categories": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/category/:slug/posts": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/category/:slug": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/changelogs": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/check-link": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/comments/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: { csrfToken: string; cid: number; content: string; name: string; mail?: string | null; link?: string | null; parent_id?: number | null };
      response: { coid: number; cid: number; content: string; name: string; mail: string | null; link: string | null; parent_id: number | null; status: number; create_time: string | Date; agent: string | null; ip: string | null };
    };
  };

  "/csrf/token": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/footprint/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/home-data": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/links/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };

    post: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/links/patch": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/messages/config": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/meting": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/page/:slug": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/posts/:category/:slug": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/random-post": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/recent-comments": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/related-posts/:cid": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/search": {
    get: {
      query: { q: string };
      body: any;
      response: { results: Array<{ cid: number; title: string; slug: string; desc: string | null; createTime: string | Date; categoryName: string | null; categorySlug: string | null; highlight?: string }>; total: number; query: string };
    };
  };

  "/settings": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/site": {
    get: {
      query: any;
      body: any;
      response: { success: boolean; data: { siteName: string; siteUrl: string; siteDesc: string; siteIcp: string; homeCustomText: string; photoCategorySlug: string; commentEnabled: boolean; commentAvatarService: string; commentPageSize: number; commentMaxLevel: number; commentInterval: number; commentRequireMail: boolean; commentRequireLink: boolean; postPageSize: number; feedCacheInterval: number; linkAutoApprove: boolean } };
    };
  };

  "/sitemap": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/stats": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/subscribes": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/tag/:slug/posts": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/tags": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/travels/index": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };

  "/user": {
    get: {
      query: any;
      body: any;
      response: any;
    };
  };
}

/**
 * 所有 API 路径联合类型
 */
export type ApiPath = keyof ApiTypes;
