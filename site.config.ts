/**
 * 全站静态配置文件
 *
 * 定义站点级别的常量，供 `nuxt.config.ts`、`app/`、`server/` 三方共同引用。
 * 运行时可变配置仍由数据库 + `useSiteSettings()` 管理，此文件仅提供：
 * 1. 数据库未初始化时的默认/兜底值
 * 2. 构建时需要的值（PWA manifest、CSP、SEO meta）
 * 3. 统一的 SEO 文案，避免各页面不一致
 *
 * 按六个区组织：站点基础设置 / 构建 / 安全 / SEO / 页面 / 功能（类型见 `lib/site-config.ts`）。
 *
 * @example
 * ```ts
 * import { siteConfig } from "@/site.config";
 * console.log(siteConfig.site.name); // "ImQi1"
 * ```
 */

import { defineSiteConfig } from "./lib/site-config";

// 原始字面量值（修改这些即可，下方派生字段自动更新）
const _name = "ImQi1";
const _desc = "做技术的分享者、生活的摄影师、时事的评论员。";
const _displayName = "做技术的分享者 · 生活的摄影师 · 时事的评论员";
const _nickname = "棋";
const _ownerName = "Qi1";
const _avatarPath = "/imgs/avatar.webp";

// 站点图标 SVG，只经 seo.ogImage 用于 og:image 与页头 logo（favicon / PWA 图标另有独立文件）
const _logoPath = "/imgs/imqi1.svg";
const _url = "https://imqi1.com";
const _cdnUrl = "https://cdn.imqi1.com";
const _host = new URL(_url).hostname;

// 站长对外链接：首页图标条与关于页按钮共用同一批字面量，避免两处各写一份
const _email = "mailto:imqi1@qq.com";
const _website = "https://qi1.website";
const _github = "https://github.com/imqi1-github";

/**
 * 全站静态配置实例
 *
 * 在任何文件中 `import { siteConfig } from ...` 即可使用。
 * 悬浮提示会展示各字段的 JSDoc 说明。
 */
export const siteConfig = defineSiteConfig({
  // ==================== 站点基础设置 ====================
  site: {
    name: _name,
    url: _url,
    cdnUrl: _cdnUrl,
    rootDomain: _host,
    avatarPath: _avatarPath,
    ownerName: _ownerName,
  },

  // ==================== 构建 ====================
  build: {
    brotliCompression: true,
    statsHtml: false,
    // Redis：仅生产构建生效（开发恒不启用），改完需重新打包；不启用时 ISR 退文件系统、搜索缓存关闭
    redis: {
      enabled: true,
      // 本机部署填 127.0.0.1；Docker 部署由构建参数覆盖，改这里对 Docker 无效
      host: "127.0.0.1",
      port: 6379,
      db: 0,
    },
  },

  // ==================== 安全 ====================
  security: {
    allowedRefererDomains: [_host],
    enableCsp: true,
  },

  // ==================== SEO ====================
  seo: {
    description: _desc,
    keywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习,摄影,时事",
    ogImage: _logoPath,
    ogLocale: "zh_CN",
    twitterSite: "@imqi1_X",
    pages: {
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
  },

  // ==================== 页面 ====================
  pages: {
    transition: {
      fadeDuration: 150,
      translateY: 14,
    },
    homeCustomText: `<p>${_displayName}</p>`,
    // 首页联系/入口图标条：模板 v-for 渲染全部条目
    homeLinks: [
      {
        name: "邮箱",
        icon: "ri:mail-fill",
        link: _email,
        target: true,
      },
      {
        name: "Github",
        icon: "ri:github-fill",
        link: _github,
        target: true,
      },
      {
        name: "X",
        icon: "ri:twitter-x-fill",
        link: "https://x.com/imqi1_X",
        target: true,
      },
      {
        name: "个人网站",
        icon: "ri:home-fill",
        link: _website,
        target: true,
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
      },
    ],
    // 关于页「交个朋友」区的外链按钮
    aboutLinks: {
      email: _email,
      website: _website,
      github: _github,
    },
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
  },

  // ==================== 功能 ====================
  features: {
    miniApi: true,
    miniComment: true,
    // 小程序审核模式（构建期开关）：开启后 /api/mini/** 只返回一篇固定的占位文章，
    // 评论一并关闭，分类/归档只留这一篇，友链/订阅/旅行/更新日志/音乐一律返回空 ——
    // 供微信审核用，避免审核员看到站内真实内容被判不合规。
    // 审核前后各构建一次（改这里必须重新 build 才生效）。
    miniFakeData: false,
    mobileQr: true,
    miniQr: true,
    amap: {
      proxy: true,
      entry: true,
    },
  },
});
