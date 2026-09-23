/**
 * 全站共享常量（app 包与 nitro 包都能通过 `#shared/constants` 引用）。
 *
 * 放这里的判断标准：**同一个值需要在 ≥2 处出现**，尤其是「前后端各写一份、必须一致」的那种。
 * 只用一次、或已有明确归属模块的（如 shared/city-coords.ts、shared/emoji-categories.ts）不要挪进来。
 */

// ==================== 分页 ====================

/** 页码上限：防超大 skip 拖慢查询（各列表接口统一） */
export const PAGE_MAX = 10000;

/** 前台内容列表（分类 / 标签 / 小程序）每页条数的上限与默认值 */
export const CONTENT_PAGE_SIZE_MAX = 50;
export const CONTENT_PAGE_SIZE_DEFAULT = 12;

/**
 * 评论「加载全部」用的 pageSize：前端 CommentList 的 loadAllComments 直接传它，
 * 后端 /api/comments 也按它钳制上限 —— 两边必须同值，否则前端请求会被静默截断。
 */
export const COMMENT_LOAD_ALL_PAGE_SIZE = 10000;

/** 公开接口 limit 参数上限 */
export const PUBLIC_LIMIT_MAX = 100;

/**
 * 后台列表每页条数的上下限：前端「自定义」档与后端 /api/admin/* 的 take 上限共用一个值，
 * 前端放更宽只会拿到「请求 N 实拿 MAX」，页数/页码全跟着错。
 */
export const ADMIN_PAGE_SIZE_MIN = 1;
export const ADMIN_PAGE_SIZE_MAX = 1000;

/** 后台「每页条数」下拉的预设档位（第 4 档「自定义」在 PageSizeSelect 里单独给） */
export const ADMIN_PAGE_SIZE_PRESETS = [10, 20, 50];

/** 钳到合法每页条数；非数字/小于下限一律回退 fallback（而非 1，避免误清空输入就只剩一条） */
export function clampAdminPageSize(value: unknown, fallback = 10): number {
  const size = Math.floor(Number(value));
  if (!Number.isFinite(size) || size < ADMIN_PAGE_SIZE_MIN) return fallback;
  return Math.min(ADMIN_PAGE_SIZE_MAX, size);
}

// ==================== 站点设置默认值 ====================
// 后台可改，这里只是「库里没有这条记录」时的兜底。同一项在服务端三张默认值表
// （server/utils/siteSettings.ts、admin/settings.get.ts、admin/settings/init.post.ts）
// 与后台表单里各出现一次 —— 必须同值，否则「保存一次」就会把默认值改写掉。

export const DEFAULT_COMMENT_AVATAR_SERVICE = "gravatar";
export const DEFAULT_COMMENT_PAGE_SIZE = 10;
/** 评论最大回复层级 */
export const DEFAULT_COMMENT_MAX_LEVEL = 4;
/** 评论发布间隔（秒） */
export const DEFAULT_COMMENT_INTERVAL = 60;
/** 订阅源缓存刷新间隔（小时） */
export const DEFAULT_FEED_CACHE_INTERVAL = 8;
/** 附件存储位置：local（本地） | cos（腾讯云） */
export const DEFAULT_UPLOAD_LOCATION = "local";
export const DEFAULT_SMTP_PORT = 465;
/** 会话存储方式：memory | redis | file */
export const DEFAULT_SESSION_STORE_TYPE = "memory";
/** 搜索缓存过期时间（秒） */
export const DEFAULT_SEARCH_CACHE_EXPIRE = 300;

// ==================== 长度与大小上限 ====================

/**
 * 上传大小上限：服务端 attachments/upload.post.ts 据此拒收，前端三个上传入口据此提前拦截。
 * 两边必须同值，否则会出现「前端放行、后端 400」或反之。
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** 实况照片保留原始 JPEG+MP4 字节，体积通常大于普通图片 */
export const MAX_LIVE_PHOTO_BYTES = 50 * 1024 * 1024;

/** 评论内容长度上限：前端计数、后端 zod、小程序手写校验三处必须同值 */
export const MAX_COMMENT_LENGTH = 5000;

/** 单条更新日志序列化后的字节上限（防单条超大内容压进一次请求） */
export const CHANGELOG_MAX_BYTES = 65535;

/** 搜索结果各分支统一的截断条数 */
export const SEARCH_RESULT_TAKE = 50;

/** 后台仪表盘「最近 / 热门」列表条数 */
export const ADMIN_DASHBOARD_TAKE = 5;

/** 取全量时的兜底 take 上限（防无界全表；真到数千条应改成真分页） */
export const UNBOUNDED_TAKE_FALLBACK = 2000;

// ==================== 接口路径与请求头 ====================

/** 取 CSRF token 的端点（前端每次写操作前都要先取一次） */
export const CSRF_TOKEN_ENDPOINT = "/api/csrf/token";

/**
 * CSRF token 的请求头名：DELETE 从 header 传，POST/PUT 从 body.csrfToken 传
 * （服务端兼容逻辑见 server/utils/admin-handler.ts）。
 */
export const CSRF_HEADER = "x-csrf-token";

// ==================== 缓存 ====================

/** 公开接口的 CDN 缓存头：CDN 与浏览器同 TTL（5 分钟） */
export const PUBLIC_CACHE_CONTROL = "public, max-age=300, s-maxage=300";

/** 不带 s-maxage 的版本：RSS / sitemap / 二维码等不经 CDN 分层、只由浏览器直接取的响应 */
export const PUBLIC_CACHE_CONTROL_SHORT = "public, max-age=300";

// ==================== 错误码 ====================

/** Prisma「记录不存在」错误码：并发删除竞态下映射为 404（判定见 server/utils/prisma.ts） */
export const PRISMA_NOT_FOUND_CODE = "P2025";

// ==================== ISR 缓存失效路由 ====================
// 传给 invalidateContentCaches({ routes })：按「本次改了什么 → 影响哪些页面」决定清哪些。
// 原先每组都在各接口里手抄一遍（40 处），改一处漏一处就会出现「改了数据前台还是旧的」。
// 路径是 Nitro 路由匹配串，`/**` 表示该前缀下全部页面。

/** 友链变更（含前台申请）→ 友链页 + 博客网络地图（/map 也含友链） */
export const LINKS_CACHE_ROUTES = ["/links", "/map"];

/** 订阅源变更 → 首页（订阅卡片）+ 订阅页 + /map */
export const SUBSCRIBE_CACHE_ROUTES = ["/", "/subscribes", "/map"];

/** 更新日志变更 → 首页 + 更新日志页 */
export const CHANGELOG_CACHE_ROUTES = ["/", "/changelogs"];

/** 评论变更 → 首页 + 分类/标签列表 + 文章详情 + 归档（评论数会变） */
export const COMMENT_CACHE_ROUTES = ["/", "/category/**", "/tag/**", "/content/**", "/archiving"];

/** 文章增删改 → 首页 + 分类/标签列表 + 文章详情 + 归档 + 站点地图 */
export const CONTENT_CACHE_ROUTES = ["/", "/category/**", "/tag/**", "/archiving", "/content/**", "/sitemap"];

/** 分类变更 → 首页 + 分类列表 + 文章详情 + 归档 + 站点地图（标签不受影响，故不含 /tag/**） */
export const CATEGORY_CACHE_ROUTES = ["/", "/category/**", "/content/**", "/archiving", "/sitemap"];

/** 标签变更 → 首页 + 标签列表 + 文章详情 + 归档 + 站点地图 */
export const TAG_CACHE_ROUTES = ["/", "/tag/**", "/content/**", "/archiving", "/sitemap"];

/** 旅行足迹变更 → 首页 + 地图 + 关于页 */
export const TRAVEL_CACHE_ROUTES = ["/", "/map", "/about"];

/** 只影响文章详情页：附件/用户资料变更（列表页不展示这些字段，无需一起清） */
export const CONTENT_DETAIL_CACHE_ROUTES = ["/content/**"];
