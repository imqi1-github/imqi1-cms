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

/**
 * 走 CDN 边缘缓存的页面（nuxt.config 的 routeRules 与响应头插件共用）。
 * ⚠️ 这些页面的 SSR HTML 必须与登录态无关——边缘缓存的是同一份 HTML 给所有人。
 */
export const CDN_CACHED_ROUTES = [
  "/",
  "/archiving",
  "/category/**",
  "/content/**",
  "/tag/**",
  "/subscribes",
  "/changelogs",
  "/agreement",
  "/sitemap",
  "/sitemap.xml",
  "/about",
  "/map",
  "/links",
  "/messages",
];

/**
 * 列表/统计页：内嵌评论数、文章数等「会随评论/文章变动」的聚合数据。
 *
 * 边缘 TTL 短（见 build.listPageCacheSeconds），写库时**不提交边缘刷新**——
 * 靠 TTL 自然过期收敛，把 EdgeOne 刷新额度留给内容页。
 * 源站缓存仍按 build.pageCacheSeconds（长），写库时照旧删对应缓存键。
 */
export const LIST_PAGE_ROUTES = [
  "/",
  "/category/**",
  "/tag/**",
  "/archiving",
  "/about",
  "/sitemap",
];

/** 内容页：改动频率低、需要长边缘缓存，靠写库后精确 URL 刷新保持新鲜 */
export const CONTENT_PAGE_ROUTES = [
  "/content/**",
  "/subscribes",
  "/changelogs",
  "/agreement",
  "/sitemap.xml",
  "/map",
  "/links",
  "/messages",
];

/** 变化很少的公开接口：加源站缓存（无 Redis 时文件缓存），并由边缘缓存 */
export const PUBLIC_STATIC_API_ROUTES = [
  "/api/categories",
  "/api/tags",
  "/api/site",
  "/api/travels",
  "/api/subscribes",
  "/api/changelogs",
  "/api/blog-network",
];

/** 浏览器必须每次向边缘验证的公开接口（含未进 routeRules 的） */
export const BROWSER_REVALIDATE_API_ROUTES = [
  ...PUBLIC_STATIC_API_ROUTES,
  "/api/home-data",
  "/api/likes/counts",
  "/api/footprint",
];

/** 相关文章接口按 cid 动态取，单独按前缀匹配 */
export const BROWSER_REVALIDATE_API_PREFIXES = ["/api/related-contents/"];

/** 不带 s-maxage 的版本：RSS / sitemap / 二维码等不经 CDN 分层、只由浏览器直接取的响应 */
export const PUBLIC_CACHE_CONTROL_SHORT = "public, max-age=300";

/** 访客分布（custom:footprint）缓存 TTL（秒）：1 小时 */
export const FOOTPRINT_CACHE_TTL = 3600;

// ==================== User-Agent ====================

/** 小程序代理上游 API（GitHub/Gitee）的 User-Agent：上游按 UA 限流/反爬 */
export const UA_MINI = "imqi1-mini";

/** 第三方冒烟请求的 User-Agent：标识来源便于上游审计 */
export const UA_SMOKE = "imqi1-cms-smoke";

// ==================== 测试 fixture ====================
// 同一字面量在多处测试内重复出现时，提到这里避免散落硬编码（换标识时一处改完）。
// 与生产 site.config.ts 的值可以不一致——测试就是要「不依赖生产配置」。

/** sitemap 真 DB 集成测的 siteUrl fixture：跨环境/CI 不依赖生产 imqi1.com */
export const TEST_SITE_URL = "https://imqi1.test";

/** TOTP issuer fixture：扫除测试内多处硬编码 "imqi1" 字符串 */
export const TEST_TOTP_ISSUER = "imqi1";

// ==================== 错误码 ====================

/** Prisma「记录不存在」错误码：并发删除竞态下映射为 404（判定见 server/utils/prisma.ts） */
export const PRISMA_NOT_FOUND_CODE = "P2025";

// ==================== 日志格式 ====================

/**
 * 日志分类 → 中文标签（用于 {tag} 占位 + file 行内容）。
 * 目录名仍用英文 category（避免中文路径在 windows/工具链兼容问题），
 * 行内标签用中文让现场可读性更高。
 * 行格式本身（LOG_LINE_FORMAT）已迁至 site.config.ts 的 logs.lineFormat；
 * 这里的键同时是 logs.categories 的合法键与 MCP get_recent_logs 的类别白名单。
 */
export const LOG_TAG_LABELS: Record<string, string> = {
  access: "访问",
  audit: "审计",
  auth: "认证",
  external: "外部",
  cache: "缓存",
  ratelimit: "限流",
  cron: "任务",
  monitor: "监控",
  app: "应用",
};

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

/** 评论变更 → 只影响内嵌评论数的列表/统计页（首页 + 分类/标签列表 + 归档 + 关于 + 站点地图）
 *
 * 这些页面的边缘 TTL 短（build.listPageCacheSeconds），写库时清掉源站缓存键即可，
 * **不提交边缘刷新**（否则每次评论都要刷这几个固定 URL，额度白烧）。
 * 文章详情页不在此列：它的评论列表是客户端实时拉 /api/comments（该接口无缓存头，
 * 边缘不缓存），SSR 里不内嵌评论数。 */
export const COMMENT_CACHE_ROUTES = ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap"];

/** 文章增删改 → 首页 + 分类/标签列表 + 文章详情 + 归档 + 站点地图 + 独立页面
 * 独立页面（type=1，contents 表里 status=1 的页面）共用此接口增删改，
 * 但渲染到独立路径（/agreement、/messages…），必须把它们列出来才会失效 ISR。
 * 新增独立页面时也要同步加到这里，否则 ISR 缓存永远不失效。
 * /sitemap.xml 是内容页（文章增删改要改它），不能跟 /sitemap 一起按列表页跳过。 */
export const CONTENT_CACHE_ROUTES = ["/", "/category/**", "/tag/**", "/archiving", "/content/**", "/sitemap", "/sitemap.xml", "/about", "/agreement", "/messages"];

/** 分类变更 → 首页 + 分类列表 + 文章详情 + 归档 + 站点地图（标签不受影响，故不含 /tag/**）
 * 分类 slug 改了会改文章 URL → /sitemap.xml 也要刷新 */
export const CATEGORY_CACHE_ROUTES = ["/", "/category/**", "/content/**", "/archiving", "/sitemap", "/sitemap.xml", "/about"];

/** 标签变更 → 首页 + 标签列表 + 文章详情 + 归档 + 站点地图 */
export const TAG_CACHE_ROUTES = ["/", "/tag/**", "/content/**", "/archiving", "/sitemap", "/about"];

/** 旅行足迹变更 → 首页 + 地图 + 关于页 */
export const TRAVEL_CACHE_ROUTES = ["/", "/map", "/about"];

/** 只影响文章/独立页详情：附件/用户资料变更（列表页不展示这些字段） */
export const CONTENT_DETAIL_CACHE_ROUTES = ["/content/**", "/agreement", "/messages"];
