/**
 * 全站静态配置文件
 *
 * 定义站点级别的常量，供 `nuxt.config.ts`、`app/`、`server/` 三方共同引用。
 * 运行时可变配置仍由数据库 + `useSiteSettings()` 管理，此文件仅提供：
 * 1. 数据库未初始化时的默认/兜底值
 * 2. 构建时需要的值（PWA manifest、CSP、SEO meta）
 * 3. 统一的 SEO 文案，避免各页面不一致
 *
 * @example
 * ```ts
 * import { siteConfig } from "@/site.config";
 * console.log(siteConfig.siteName); // "ImQi1"
 * ```
 */

import { defineSiteConfig } from "./lib/site-config";

// 原始字面量值（修改这些即可，下方派生字段自动更新）
const _name = "ImQi2";
const _desc = "12312313213213";
const _displayName = "1131231231231";
const _nickname = "棋2";
const _ownerName = "Qi2";
const _avatarPath = "/imgs/avatar.webp";
const _url = "http://localhost:3000";
const _cdnUrl = "";
const _host = new URL(_url).hostname;
const _isProduction = process.env.NODE_ENV === "production";

// 静态资源 CDN 前缀：生产环境带 CDN 根（不带构建 hash），开发环境为空走本地 public
const _assetPrefix = _isProduction ? _cdnUrl : "";


/**
 * 全站静态配置实例
 *
 * 在任何文件中 `import { siteConfig } from ...` 即可使用。
 * 悬浮提示会展示各字段的 JSDoc 说明。
 */
export const siteConfig = defineSiteConfig({
  siteName: _name,
  siteUrl: _url,
  cdnUrl: _cdnUrl,
  rootDomain: _host,
  siteAvatarPath: `${_assetPrefix}${_avatarPath}`,
  ownerName: _ownerName,

  security: {
    allowedRefererDomains: [_host],
  },

  seo: {
    description: _desc,
    keywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习,摄影,时事",
    ogImage: `${_assetPrefix}/imgs/imqi1.svg`,
    ogLocale: "zh_CN",
    twitterSite: "@imqi1_X",
  },

  social: [
    {
      name: "邮箱",
      icon: "ri:mail-fill",
      link: "mailto:imqi1@qq.com",
      target: true
    },
    {
      name: "Github",
      icon: "ri:github-fill",
      link: "https://github.com/imqi1-github",
      target: true
    },
    {
      name: "X",
      icon: "ri:twitter-x-fill",
      link: "https://x.com/imqi1_X",
      target: true
    },
    {
      name: "个人网站",
      icon: "ri:home-fill",
      link: "https://qi1.website",
      target: true
    },
    {
      name: "小程序",
      icon: "ri:mini-program-fill",
      qrcode: "/imgs/miniprogram.jpg",
    },
    {
      name: "开往",
      icon: "ri:subway-fill",
      link: "https://www.travellings.cn/go-by-clouds.html",
      target: true,
    },
    {
      name: "虫洞",
      icon: "ri:earth-fill",
      link: "https://foreverblog.cn/go.html",
      target: true,
    }
  ],

  manifest: {
    name: _name,
    shortName: _name,
    description: _desc,
    themeColor: "#f9fafb",
    backgroundColor: "#ffffff",
  },

  build: {
    // 是否在构建时预压缩静态资源为 brotli（生成 .br 文件）
    // 需 Nginx 配合 brotli_static on，或 CDN 直接发送预压缩文件
    brotliCompression: true,
  },

  features: {
    // 是否启用小程序 API。关闭后 server/api/mini 不会在开发/生产环境注册，也不会打入生产包。
    miniApi: true,
    // 是否开启小程序评论功能。关闭后小程序端不展示评论区、服务端评论接口也不受理。
    miniComment: true,
  },

  amap: {
    useNginxProxy: {
      development: false,
      production: true,
    },
    // 是否在站点各处展示指向地图页的入口胶囊。开发默认开；生产默认关——
    // 待后台/环境配好高德 apikey（地图可正常加载）后再把 production 改为 true。
    entryLinks: {
      development: true,
      production: true,
    },
  },

  // 页面过渡动画时长（ms）：app.vue 全局淡出/淡入真实时长，也是各页面等待过渡完成再启动元素动画的统一延迟
  pageTransition: {
    fadeDuration: 150,
  },

  homeCustomText: `<p>${_displayName}</p>`,

  links: {
    blogOrganizations: [
      { name: "十年之约", url: "https://www.foreverblog.cn/blog/5868.html", icon: "/imgs/foreverblog.png" },
      { name: "开往", url: "https://list.travellings.cn/", icon: "/imgs/travelling.png" },
      { name: "博友圈", url: "https://www.boyouquan.com/blogs/imqi1.com", icon: "/imgs/boyouquan.png" },
      { name: "Blogfinder", url: "https://bf.zzxworld.com/s/976", icon: "/imgs/blogfinder.png" },
      { name: "个站商店", url: "https://storeweb.cn/member/o/2146", icon: "/imgs/storeweb.png" },
    ],
    profile: {
      siteName: `${_name} / ${_nickname}`,
      siteUrl: _url,
      siteDescription: _displayName,
      siteAvatar: "https://cn.cravatar.com/avatar/2841d29eeabab633ae116c7b2c97e3bf?s=512",
    },
  },

  pageSeo: {
    home: {
      description: `${_name} - ${_desc}记录编程学习、生活点滴和时事评论的个人博客。`,
      keywords: `${_name},个人博客,技术博客,编程,Nuxt,Vue,JavaScript,摄影,时事评论`,
    },
    about: {
      description: `了解${_name}，一个热爱技术、摄影和时事的博主。查看我的技能栈、MBTI 性格类型和统计数据。`,
      keywords: `关于,关于我,个人介绍,技能栈,博主,${_name}`,
    },
    links: {
      description: `查看${_name}的友情链接，发现更多优秀的博客和网站。欢迎申请友链交换。`,
      keywords: `友情链接,友链,博客链接,网站推荐,链接交换`,
    },
    messages: {
      description: `在${_name}留言板留下你的足迹，说出你的想法。欢迎与我交流技术和生活。`,
      keywords: `留言,留言板,评论,交流,互动`,
    },
    changelogs: {
      description: `查看${_name}的网站更新日志，了解每次版本更新的详细内容，包括新增功能、优化改进和问题修复。`,
      keywords: `更新日志,版本更新,站点更新,changelog,${_name}`,
    },
    sitemap: {
      description: `浏览${_name}的站点地图，快速找到所有页面、文章分类和标签导航。`,
      keywords: `站点地图,网站地图,sitemap,导航,${_name}`,
    },
    archiving: {
      description: `查看${_name}的全部文章归档，按时间线浏览所有发布的内容。`,
      keywords: `文章归档,时间线,文章列表,归档,${_name}`,
    },
    subscribes: {
      description: `查看${_name}订阅的博客和网站，发现更多优质内容来源。`,
      keywords: `订阅,RSS,博客订阅,订阅源,${_name}`,
    },
    search: {
      description: `在${_name}搜索文章、标签和分类，快速找到你感兴趣的内容。`,
      keywords: `搜索,站内搜索,文章搜索,${_name}`,
    },
    map: {
      description: `${_name}的地图中心：跟随我的足迹看走过的城市，或在访客分布里看看读者们来自哪里。`,
      keywords: `地图,我的足迹,访客分布,读者足迹,旅行地图,${_name}`,
    },
    agreement: {
      description: `查看${_name}的站点协议，包括评论规范、友链规则和使用条款。`,
      keywords: `协议,站点协议,评论规范,友链规则,使用条款,${_name}`,
    },
    notFound: {
      description: "您访问的页面不存在。请返回首页或使用站点导航查找您需要的内容。",
      keywords: "404,页面未找到,页面不存在",
    },
    category: {
      description: (name, desc) => `浏览${name}分类下的所有文章，${desc || "查看相关技术文章和教程"}`,
      keywords: (name, desc) => `${name},分类,博客,${desc || ""}`,
    },
    tag: {
      description: name => `浏览带有${name}标签的所有文章，查看相关内容和技术分享`,
      keywords: name => `${name},标签,博客,文章`,
    },
  },
});

/**
 * 完整的 og:image URL（siteUrl + ogImage 路径拼接）
 * @example "https://imqi1.com/imgs/og-image.png"
 */
export const fullOgImage: string = siteConfig.seo.ogImage;
