/**
 * 站点配置类型定义与辅助函数
 *
 * 此文件存放 {@link SiteConfig} 接口与 {@link defineSiteConfig} 类型守卫函数，
 * 供 `site.config.ts` 引用。将类型与实现分离，让 `site.config.ts` 只保留纯配置值。
 *
 * @module lib/site-config
 */

/**
 * 站点配置类型定义
 *
 * 修改此处字段会同步触发所有引用处的 TypeScript 类型检查。
 */
export interface SiteConfig {
  /** 站点名称，用作 PWA manifest、SEO og:site_name、邮件署名等兜底值 */
  siteName: string;
  /** 站点主域名（含协议），用作 canonical URL、og:url 前缀、PWA start_url 等 */
  siteUrl: string;
  /** CDN 域名（含协议），用于静态资源 CDN 加速及 CSP 白名单 */
  cdnUrl: string;
  /** 站点根域名（不含协议），用于反向代理与 Referer 校验 */
  rootDomain: string;
  /** 本地头像路径（开发环境走本地，生产环境自动带 CDN 前缀） */
  siteAvatarPath: string;
  /** 站长显示名（如 "Qi1"） */
  ownerName: string;
  /** 安全相关静态配置 */
  security: {
    /** 允许访问 API 的 Referer 根域名列表 */
    allowedRefererDomains: string[];
    /**
     * 是否启用 CSP（内容安全策略）。仅生产构建（含 nuxi preview）生效：每请求生成 nonce，
     * 通过 HTTP 响应头投递 `Content-Security-Policy`（script-src 走 nonce + strict-dynamic），
     * 并给所有 <script> 注入 nonce。详见 server/utils/csp.ts 与 server/plugins/csp.ts。
     * 本地用 `nuxi preview` 验证打包产物时可临时关闭：CSP 会拦截音乐直链、地图第三方等，
     * 干扰功能验证；正式部署应保持开启。
     */
    enableCsp: boolean;
  };
  /** SEO 默认文案及 Open Graph / Twitter Card 元数据 */
  seo: {
    /** 默认 SEO description，页面级可覆盖 */
    description: string;
    /** 默认 SEO keywords，页面级可覆盖 */
    keywords: string;
    /** og:image / twitter:image 的相对路径（会与 siteUrl 拼接） */
    ogImage: string;
    /** og:locale */
    ogLocale: string;
    /** twitter:site 的 @用户名 */
    twitterSite: string;
  };
  /** 站长社交/联系方式 */
  social: Array<{
    /** 名称 */
    name: string,
    /** 图标 */
    icon: string,
    /** 社交链接*/
    link?: string,
    /** target */
    target?: boolean,
    /** 悬浮展示的二维码图片（如小程序码），设置后该项不作为链接 */
    qrcode?: string
  }>,
  /** PWA manifest 静态配置 */
  manifest: {
    /** manifest name */
    name: string;
    /** manifest short_name */
    shortName: string;
    /** manifest description */
    description: string;
    /** manifest theme_color */
    themeColor: string;
    /** manifest background_color */
    backgroundColor: string;
  };
  /** 构建相关静态配置（由 nuxt.config.ts 读取） */
  build: {
    /** 是否在构建时预压缩静态资源为 brotli（生成 .br 文件，需 Nginx brotli_static on 配合） */
    brotliCompression: boolean;
  };
  /** 功能开关 */
  features: {
    /** 是否启用小程序服务端 API（server/api/mini）；关闭后开发/生产都不注册这些路由 */
    miniApi: boolean;
    /** 是否开启小程序评论功能；关闭后小程序端不展示评论区、服务端评论接口也不受理 */
    miniComment: boolean;
  };
  /** 高德地图接入配置 */
  amap: {
    /** 是否通过同源 Nginx/Nitro 代理获取地图密钥；开发和生产环境可分开配置 */
    useNginxProxy: {
      development: boolean;
      production: boolean;
    };
    /** 是否在站点各处（订阅页 / 友链页 / 首页 / 留言板 / 关于页）展示指向地图页的入口胶囊；
     *  生产环境尚未配置高德 apikey 时可置为 false，避免出现指向「无法加载的地图页」的死链。
     *  开发、生产环境可分开配置（如开发默认开、生产待配好密钥后再开） */
    entryLinks: {
      development: boolean;
      production: boolean;
    };
  };
  /** 页面过渡动画，供 app.vue 全局淡出/淡入及部分页面的「等待过渡完成」延迟引用 */
  pageTransition: {
    /** 单次淡出/淡入动画时长（ms）—— app.vue <main> 全局页面过渡的真实时长（JS 与 CSS 共用），
     *  同时作为各页面「onMounted 后等待过渡完成、再启动页面内元素滚动渐入」的统一延迟 */
    fadeDuration: number;
    /** 渐出「向下移动」/ 渐入「向上移动」的位移幅度（px）。首页因 hero fixed 视差不参与位移，其余页面叠加 */
    translateY: number;
  };
  /** 首页自定义公告文案（HTML），作为数据库默认种子值 */
  homeCustomText: string;
  /** 友链页配置 */
  links: {
    /** 友链页展示的「本站已加入的博客组织」列表 */
    blogOrganizations: BlogOrganization[];
    /** 本站信息展示用配置 */
    profile: {
      /** 站点名称（可含昵称，如 "ImQi1 / 棋"） */
      siteName: string;
      /** 站点 URL */
      siteUrl: string;
      /** 站点描述文案 */
      siteDescription: string;
      /** 站点头像完整 URL（用于友链页展示等） */
      siteAvatar: string;
    };
  };
  /** 各页面 SEO 文案（description / keywords），统一管理避免散落各页面 */
  pageSeo: PageSeo;
}

/** 博客组织条目（友链页展示） */
export interface BlogOrganization {
  /** 组织名称 */
  name: string;
  /** 组织链接 URL */
  url: string;
  /** 组织图标相对路径（如 /imgs/foreverblog.png，不需要加 cdn 前缀） */
  icon: string;
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
