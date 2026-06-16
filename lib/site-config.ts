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
  social: {
    /** GitHub 主页完整 URL */
    github: string;
    /** 联系邮箱 */
    email: string;
    /** Twitter/X 用户名（含 @） */
    twitter: string;
    /** Twitter/X 主页完整 URL */
    twitterUrl: string;
    /** npm 个人主页完整 URL */
    npm: string;
    /** 个人主页 URL（非本站） */
    homePage: string;
  };
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
  /** 组织图标相对路径（如 /imgs/foreverblog.png） */
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
