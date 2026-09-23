/**
 * 站点配置类型定义与辅助函数
 *
 * 此文件存放 {@link SiteConfig} 接口与 {@link defineSiteConfig} 类型守卫函数，
 * 供 `site.config.ts` 引用。将类型与实现分离，让 `site.config.ts` 只保留纯配置值。
 *
 * 配置按六个区组织：站点基础设置 / 构建 / 安全 / SEO / 页面 / 功能。
 *
 * @module lib/site-config
 */

/**
 * 站点配置类型定义（六个区）
 *
 * 修改此处字段会同步触发所有引用处的 TypeScript 类型检查。
 */
export interface SiteConfig {
  /** 站点基础设置：站名、域名、站长信息与社交入口 */
  site: SiteBaseConfig;
  /** 构建相关静态配置（由 nuxt.config.ts 读取） */
  build: SiteBuildConfig;
  /** 安全相关静态配置 */
  security: SiteSecurityConfig;
  /** SEO 默认文案、Open Graph / Twitter Card 元数据及各页文案 */
  seo: SiteSeoConfig;
  /** 页面级配置：过渡动画、首页文案、友链页 */
  pages: SitePagesConfig;
  /** 功能开关 */
  features: SiteFeaturesConfig;
}

// ==================== 站点基础设置 ====================

/** 站点基础设置 */
export interface SiteBaseConfig {
  /** 站点名称，用作 PWA manifest、SEO og:site_name、邮件署名等兜底值 */
  name: string;
  /** 站点主域名（含协议），用作 canonical URL、og:url 前缀、PWA start_url 等 */
  url: string;
  /** CDN 域名（含协议），用于静态资源 CDN 加速及 CSP 白名单 */
  cdnUrl: string;
  /** 站点根域名（不含协议），用于反向代理与 Referer 校验 */
  rootDomain: string;
  /** 头像路径 */
  avatarPath: string;
  /** 站长显示名（如 "Qi1"） */
  ownerName: string;
}

// ==================== 构建 ====================

/** 构建相关静态配置（由 nuxt.config.ts 读取） */
export interface SiteBuildConfig {
  /** 是否在构建时预压缩静态资源为 brotli（生成 .br 文件，需 Nginx brotli_static on 配合） */
  brotliCompression: boolean;
  /** 是否生成 vite visualizer 体积分析（stats.html）—— 默认 false，仅需排查包体积时打开 */
  statsHtml: boolean;
  /** Redis 连接配置（仅生产构建生效，开发环境恒不启用） */
  redis: RedisBuildConfig;
}

/**
 * Redis 构建期配置
 *
 * 由 `nuxt.config.ts` 在打包时读取并烘焙进产物（nitro storage/routeRules 的 ISR 增量缓存 +
 * `runtimeConfig.redis` 的搜索缓存，见 `shared/redis-config.ts`）。**仅生产构建生效**。
 */
export interface RedisBuildConfig {
  /** 是否启用 Redis。置 false（或 host 为空）时不报错降级：页面整页缓存与搜索缓存一并关闭（页面实时 SSR） */
  enabled: boolean;
  /** Redis 主机。本机部署填 127.0.0.1；Docker 部署由构建参数覆盖，改这里对 Docker 无效 */
  host: string;
  /** Redis 端口 */
  port: number;
  /** Redis 数据库序号（0-15） */
  db: number;
}

// ==================== 安全 ====================

/** 安全相关静态配置 */
export interface SiteSecurityConfig {
  /** 允许访问 API 的 Referer 根域名列表 */
  allowedRefererDomains: string[];
  /**
   * 是否启用 CSP（内容安全策略）。仅生产构建（含 nuxi preview）生效：以 HTTP 响应头投递
   * `Content-Security-Policy`。**不用 nonce**（script-src 为 `'unsafe-inline' 'unsafe-eval' 'self' https:`）：
   * 高德运行时 SDK 内部走 javascript: URL，只能靠 'unsafe-inline' 放行，而 CSP3 下 nonce 在场会让
   * 'unsafe-inline' 整体失效。原因与取舍详见 server/utils/csp.ts，投递见 server/plugins/csp.ts。
   * 本地用 `nuxi preview` 验证打包产物时可临时关闭：CSP 会拦截音乐直链、地图第三方等，
   * 干扰功能验证；正式部署应保持开启。
   */
  enableCsp: boolean;
}

// ==================== SEO ====================

/** SEO 默认文案及 Open Graph / Twitter Card 元数据 */
export interface SiteSeoConfig {
  /** 默认 SEO description，页面级可覆盖 */
  description: string;
  /** 默认 SEO keywords，页面级可覆盖 */
  keywords: string;
  /** og:image / twitter:image 图片路径。当前直接复用站点图标 */
  ogImage: string;
  /** og:locale */
  ogLocale: string;
  /** twitter:site 的 @用户名 */
  twitterSite: string;
  /** 各页面 SEO 文案，统一管理避免散落各页面 */
  pages: PageSeo;
}

/** 静态页面的 SEO 配置项 */
export interface PageSeoItem {
  /** SEO description */
  description: string;
  /** SEO keywords */
  keywords: string;
}

/** 动态页面（分类/标签）的 SEO 配置项，根据运行时数据生成文案 */
export interface DynamicPageSeoItem {
  /** 根据名称和可选描述生成 SEO description */
  description: (name: string, desc?: string) => string;
  /** 根据名称和可选描述生成 SEO keywords */
  keywords: (name: string, desc?: string) => string;
}

/** 各页面 SEO 文案集合 */
export interface PageSeo {
  /** 首页 */
  home: PageSeoItem;
  /** 关于页 */
  about: PageSeoItem;
  /** 友情链接页 */
  links: PageSeoItem;
  /** 留言板 */
  messages: PageSeoItem;
  /** 更新日志 */
  changelogs: PageSeoItem;
  /** 站点地图 */
  sitemap: PageSeoItem;
  /** 文章归档 */
  archiving: PageSeoItem;
  /** 我的订阅 */
  subscribes: PageSeoItem;
  /** 搜索 */
  search: PageSeoItem;
  /** 地图中心页（我的足迹 / 访客分布） */
  map: PageSeoItem;
  /** 协议 */
  agreement: PageSeoItem;
  /** 404 页面 */
  notFound: PageSeoItem;
  /** 分类页（动态） */
  category: DynamicPageSeoItem;
  /** 标签页（动态） */
  tag: DynamicPageSeoItem;
}

// ==================== 页面 ====================

/** 页面级配置 */
export interface SitePagesConfig {
  /** 页面过渡动画，供 app.vue 全局淡出/淡入及部分页面的「等待过渡完成」延迟引用 */
  transition: PageTransitionConfig;
  /** 首页自定义公告文案（HTML），作为数据库默认种子值 */
  homeCustomText: string;
  /** 首页联系/入口图标条：模板 v-for 渲染全部条目 */
  homeLinks: HomeLinkItem[];
  /** 关于页「交个朋友」区的外链按钮 */
  aboutLinks: AboutLinksConfig;
  /** 友链页配置 */
  links: LinksConfig;
}

/** 首页联系/入口图标条条目（图标 + 链接，或图标 + 二维码） */
export interface HomeLinkItem {
  /** 名称，同时也是 v-for 的 key 与 popover id 后缀，须唯一 */
  name: string;
  /** 图标 */
  icon: string;
  /** 跳转链接；与 qrcode 二选一 */
  link?: string;
  /** 是否新窗口打开 */
  target?: boolean;
  /** 悬浮展示的二维码图片（如小程序码），设置后该项不作为链接 */
  qrcode?: string;
}

/** 关于页「交个朋友」区的外链 */
export interface AboutLinksConfig {
  /** 邮箱地址（含 mailto: 前缀） */
  email: string;
  /** 个人网站 */
  website: string;
  /** GitHub 主页 */
  github: string;
}

/** 页面过渡动画 */
export interface PageTransitionConfig {
  /** 单次淡出/淡入动画时长（ms）—— app.vue <main> 全局页面过渡的真实时长（JS 与 CSS 共用），
   *  同时作为各页面「onMounted 后等待过渡完成、再启动页面内元素滚动渐入」的统一延迟 */
  fadeDuration: number;
  /** 渐出「向下移动」/渐入「向上移动」的位移幅度（px）。首页因 hero fixed 视差不参与位移，其余页面叠加 */
  translateY: number;
}

/** 友链页配置 */
export interface LinksConfig {
  /** 友链页展示的「本站已加入的博客组织」列表 */
  blogOrganizations: BlogOrganization[];
  /** 本站信息展示用配置 */
  profile: LinksProfile;
}

/** 博客组织条目（友链页展示） */
export interface BlogOrganization {
  /** 组织名称 */
  name: string;
  /** 组织链接 URL */
  url: string;
  /** 组织图标相对路径（如 /imgs/foreverblog.png） */
  icon: string;
}

/** 友链页「本站信息」区块 */
export interface LinksProfile {
  /** 站点名称（可含昵称，如 "ImQi1 / 棋"） */
  siteName: string;
  /** 站点 URL */
  siteUrl: string;
  /** 站点描述文案 */
  siteDescription: string;
  /** 站点头像完整 URL（用于友链页展示等） */
  siteAvatar: string;
}

// ==================== 功能 ====================

/** 功能开关 */
export interface SiteFeaturesConfig {
  /** 是否启用小程序服务端 API（server/api/mini）；关闭后开发/生产都不注册这些路由 */
  miniApi: boolean;
  /** 是否开启小程序评论功能；关闭后小程序端不展示评论区、服务端评论接口也不受理 */
  miniComment: boolean;
  /**
   * 小程序审核模式：开启后 /api/mini/* 只返回一篇固定占位文章，评论一并关闭，
   * 分类/归档只留这一篇，友链/订阅/旅行/更新日志/音乐一律空 —— 供微信审核用。
   * 构建期开关，改动需重新 build。
   */
  miniFakeData: boolean;
  /** 文章页「本文可在【手机】上看」入口开关 */
  mobileQr: boolean;
  /** 文章页「本文可在【小程序】上看」入口开关（还需运行时配置 WECHAT_MINI_* 才显示） */
  miniQr: boolean;
  /** 高德地图接入配置 */
  amap: AmapConfig;
}

/** 高德地图接入配置 */
export interface AmapConfig {
  /** 生产环境是否经服务端同源代理 /_AMapService 取地图密钥（key 不下发到浏览器）；开发环境恒直连，此项不生效 */
  proxy: boolean;
  /** 是否在订阅页 / 友链页 / 首页 / 留言板 / 关于页展示指向地图页的入口胶囊；未配好高德 apikey 时置 false 以免死链 */
  entry: boolean;
}

/**
 * 类型守卫函数，提供 TypeScript 类型推导与 IDE 悬浮提示。
 *
 * 类似 Vite 的 `defineConfig`，确保配置字段符合 {@link SiteConfig} 类型约束。
 *
 * @param config - 站点配置对象
 * @returns 原样返回 config，类型被收窄为 SiteConfig
 */
export function defineSiteConfig(config: SiteConfig): SiteConfig {
  return config;
}
