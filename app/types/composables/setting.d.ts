/**
 * 站点设置相关类型定义
 */

import type { InternalApi } from "nitropack/types";

/** 站点设置（从 InternalApi 推导，与 server/api/site.get.ts 的 SiteSettings 对齐） */
export type SiteSettings = NonNullable<InternalApi["/api/site"]["get"]["data"]>;