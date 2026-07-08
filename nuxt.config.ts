import { existsSync, readFileSync } from "fs";

import { visualizer } from "rollup-plugin-visualizer";

import { siteConfig, fullOgImage } from "./site.config";
import { resolveAmapRuntimeConfig } from "./shared/amap-runtime";

// 读取构建 hash（如果存在）
const buildHashDir = existsSync(".build-hash-dir") ? `/${readFileSync(".build-hash-dir", "utf-8").trim()}` : "";
const isProduction = process.env.NODE_ENV === "production";

// 只有配置了有效的 CDN URL 才使用 CDN
const hasCdn = siteConfig.cdnUrl && siteConfig.cdnUrl.startsWith("http");
const cdnURL = isProduction && hasCdn ? (buildHashDir ? `${siteConfig.cdnUrl}${buildHashDir}` : siteConfig.cdnUrl) : "";
const publicCdnAsset = (path: string) => (isProduction && hasCdn ? `${siteConfig.cdnUrl}${path}` : path);
// CSP 中使用的 CDN 源：未配置时回退为空字符串，避免拼接出字面量 "undefined" 导致该指令失效
const cspCdn = hasCdn ? siteConfig.cdnUrl : "";
const cspContent = `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${cspCdn} https://*.amap.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' ${cspCdn}; img-src 'self' data: https: blob: ${cspCdn}; font-src 'self' data: ${cspCdn}; manifest-src 'self' ${cspCdn}; media-src 'self' https: http: data: blob:; connect-src 'self' ${cspCdn} https://api.github.com https://gitee.com https://*.amap.com blob:; object-src 'none'; base-uri 'self'; form-action 'self';`;
const nitroIgnore = siteConfig.features.miniApi ? [] : ["api/mini/**"];

// 获取当前环境的 Redis 配置
function getRedisConfig() {
  const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== "production";
  const host = isDev ? process.env.REDIS_HOST_DEV : process.env.REDIS_HOST_PROD;

  if (!host) {
    return null;
  }

  const portKey = isDev ? "REDIS_PORT_DEV" : "REDIS_PORT_PROD";
  const passwordKey = isDev ? "REDIS_PASSWORD_DEV" : "REDIS_PASSWORD_PROD";
  const dbKey = isDev ? "REDIS_DB_DEV" : "REDIS_DB_PROD";

  return {
    host,
    port: Number(process.env[portKey]) || 6379,
    password: process.env[passwordKey],
    db: Number(process.env[dbKey]) || 0,
    lazyConnect: false,
  };
}

const redisConfig = getRedisConfig();
const amapRuntime = resolveAmapRuntimeConfig({
  nodeEnv: process.env.NODE_ENV,
  key: process.env.AMAP_KEY || "",
  securityJsCode: process.env.AMAP_SECURITY_CODE || "",
  useNginxProxy: siteConfig.amap.useNginxProxy,
});

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  rootDir: ".",

  // 构建时跳过类型检查（已有独立的 vue-tsc 检查流程）
  typescript: {
    typeCheck: false,
  },

  // 禁用开发环境的ISR payload缓存（避免目录错误）
  experimental: {
    payloadExtraction: false,
  },

  // 禁用 sourcemap 以减少构建时间和内存占用
  sourcemap: false,

  // devServer: {
  //   port: 4000,
  // },

  runtimeConfig: {
    amapKey: process.env.AMAP_KEY || "",
    amapSecurityCode: process.env.AMAP_SECURITY_CODE || "",
    ssrInternalRequestSecret: process.env.SSR_INTERNAL_REQUEST_SECRET || "",
    public: {
      cdnURL: cdnURL,
      cdnBase: siteConfig.cdnUrl, // 不带 hash 的 CDN 根，用于 imgs/skills/icons/emojis 等静态资源
      buildHashDir: buildHashDir, // 保存 hash 目录供运行时使用
      rootDomain: siteConfig.rootDomain, // 防止反向代理的根域名
      amapEnabled: amapRuntime.enabled,
      amapUseProxy: amapRuntime.useProxy,
      amapKey: amapRuntime.publicKey,
      amapSecurityCode: amapRuntime.publicSecurityJsCode,
    },
  },

  modules: ["shadcn-nuxt", "@nuxt/icon", "@nuxtjs/color-mode", "@vite-pwa/nuxt", "@nuxt/eslint"],

  icon: {
    // 服务端用本地已安装的 @iconify-json/* 集合渲染，SSR 时把用到的图标
    // SVG 数据通过 Nuxt payload 下发，客户端 hydration 时直接从 payload
    // 注册图标（addIcon），首屏无需异步请求、不闪烁。
    // 不启用 clientBundle.scan：避免把图标数据重复内联进客户端 JS chunk
    // （此前约 122KB），改为纯按需——SSR 图标走 payload，仅客户端动态
    // 出现、SSR 未覆盖到的图标才回退到 /api/_nuxt_icon 拉取（有缓存）。
    serverBundle: "local",
    // 客户端回退只走本地 /api/_nuxt_icon（由本地 @iconify-json/* 包解析），
    // 关闭对 api.iconify.design 的回退：默认 fallbackToApi=true 会把公网 API
    // 一并塞进 @iconify/vue 的 resources 负载均衡池，客户端可能直接命中公网域名，
    // 被生产 CSP connect-src 拦截。ri/lucide 集合本地已安装，公网回退纯多余。
    fallbackToApi: false,
    // 本地自定义图标集合：app/assets/icons/*.svg → <Icon name="app:文件名" />
    // 用于承接品牌 logo（Nuxt/Prisma/MySQL/Google 等），SSR 本地渲染，
    // 不再回退 api.iconify.design（生产环境 CSP 已拦截该域名）。
    customCollections: [
      {
        prefix: "app",
        dir: "./app/assets/icons",
      },
    ],
    clientBundle: {
      // 首页社交图标在客户端路由切换进入首页时没有 SSR payload，逐个回退请求会导致闪烁；
      // 仅手动内联这几个首屏图标，保持它们一起随 v-scroll-reveal 渐入。
      icons: [
        "ri:mail-fill",
        "ri:github-fill",
        "ri:twitter-x-fill",
        "ri:home-fill",
        "ri:subway-fill",
        "ri:earth-fill",
        // 页脚技术栈图标在 <ClientOnly> 内渲染，无 SSR payload；
        // 内联进 client bundle 避免逐个回退 /api/_nuxt_icon 请求与闪烁。
        "app:nuxt",
        "app:prisma",
        "app:mysql",
        // 首页技术栈大字标（客户端路由切换进入首页时无 SSR payload）。
        "app:nuxt-wordmark",
        "app:prisma-wordmark",
        "app:mysql-wordmark",
        // 评论列表设备信息图标为动态 :name 绑定，scan 扫不到，
        // 且评论多为客户端异步加载，内联避免运行时请求。
        "app:linux",
      ],
    },
  },

  colorMode: {
    classSuffix: "",
    fallback: "light",
    storageKey: "theme",
  },

  shadcn: {
    prefix: "",
    componentDir: "./app/components/ui",
  },

  pwa: {
    registerType: "autoUpdate",
    // 开发环境也启用 PWA（用于测试）
    devOptions: {
      enabled: false,
    },
    // 生产环境配置
    manifest: {
      name: siteConfig.manifest.name,
      short_name: siteConfig.manifest.shortName,
      description: siteConfig.manifest.description,
      theme_color: siteConfig.manifest.themeColor,
      background_color: siteConfig.manifest.backgroundColor,
      display: "fullscreen",
      lang: "zh-CN",
      start_url: siteConfig.siteUrl,
      scope: siteConfig.siteUrl,
      id: "/",
      icons: [
        {
          src: publicCdnAsset("/imgs/imqi1.svg"),
          sizes: "192x192",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
        {
          src: publicCdnAsset("/imgs/imqi1.svg"),
          sizes: "512x512",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
      screenshots: [
        {
          src: publicCdnAsset("/imgs/frontend-screenshot1.png"),
          sizes: "1280x720",
          type: "image/png",
          form_factor: "wide",
          label: "桌面端界面",
        },
        {
          src: publicCdnAsset("/imgs/frontend-screenshot2.png"),
          sizes: "510x820",
          type: "image/png",
          form_factor: "narrow",
          label: "移动端界面",
        },
      ],
    },
    workbox: {
      // SSR 站点：禁用 SPA 导航回退，避免 precache 找不到 "/" 报 non-precached-url
      navigateFallback: null,
      // 把 workbox 运行时内联进 sw.js，避免其被 app.cdnURL 改写到 CDN
      // （CDN 上的 workbox-*.js 跨域 + 403，会导致 SW install 时 importScripts 失败、整个 SW 不生效）
      inlineWorkboxRuntime: true,
      // 缓存静态资源
      runtimeCaching: [
        {
          urlPattern: /\.(?:css|js|mjs)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "static-resources",
            // CDN 跨域资源以 no-cors 方式请求时会返回 status 0 的 opaque 响应，
            // CacheFirst 默认只缓存 200，需显式允许 0 才能缓存跨域 CSS/JS/字体
            cacheableResponse: {
              statuses: [0, 200],
            },
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            },
          },
        },
        {
          urlPattern: /\.(?:png|jpg|jpeg|gif|svg|webp|ico|bmp)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "images",
            cacheableResponse: {
              statuses: [0, 200],
            },
            expiration: {
              maxEntries: 200,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            },
          },
        },
        {
          urlPattern: /\.(?:mp4|webm|ogg|mov|avi)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "videos",
            cacheableResponse: {
              statuses: [0, 200],
            },
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            },
          },
        },
        {
          urlPattern: /\.(?:mp3|wav|flac|aac)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "audio",
            cacheableResponse: {
              statuses: [0, 200],
            },
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            },
          },
        },
        {
          urlPattern: /\.(?:woff|woff2|ttf|eot|otf)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "fonts",
            cacheableResponse: {
              statuses: [0, 200],
            },
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            },
          },
        },
      ],
    },
  },

  app: {
    baseURL: "/",
    buildAssetsDir: "/_nuxt/",
    cdnURL: cdnURL,
    head: {
      htmlAttrs: {
        lang: "zh-CN",
      },
      link: [
        {
          rel: "preconnect",
          href: siteConfig.cdnUrl,
        },
        {
          rel: "dns-prefetch",
          href: siteConfig.cdnUrl,
        },
        // RSS 订阅
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: "RSS 订阅",
          href: "/feed",
        },
        // 字体样式表（根据 CDN 配置动态生成）
        {
          rel: "stylesheet",
          href: publicCdnAsset("/fonts/font.css"),
        },
        // PWA Manifest（仅在生产环境加载）
        ...(isProduction
          ? [
              {
                rel: "manifest",
                href: publicCdnAsset("/manifest.webmanifest"),
              },
            ]
          : []),
        // Favicon（根据 CDN 配置动态生成）
        {
          rel: "icon",
          type: "image/x-icon",
          href: publicCdnAsset("/favicon.ico"),
        },
        // Apple Touch Icon（根据 CDN 配置动态生成）
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: publicCdnAsset("/imgs/imqi1-144.png"),
        },
      ],
      meta: [
        ...(isProduction && siteConfig.security.enableCsp
          ? [
              {
                "http-equiv": "Content-Security-Policy",
                content: cspContent,
              },
            ]
          : []),
        // 基础元信息
        {
          name: "author",
          content: siteConfig.siteName,
        },
        // Open Graph（仅全局静态项，title/description 由各页面 usePageSeo 设置）
        {
          property: "og:site_name",
          content: siteConfig.siteName,
        },
        {
          property: "og:image",
          content: fullOgImage,
        },
        {
          property: "og:locale",
          content: siteConfig.seo.ogLocale,
        },
        // Twitter Card（仅全局静态项）
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:image",
          content: fullOgImage,
        },
        {
          name: "twitter:site",
          content: siteConfig.seo.twitterSite,
        },
        // 其他
        {
          name: "theme-color",
          content: "#f9fafb",
        },
        {
          name: "mobile-web-app-capable",
          content: "yes",
        },
        {
          name: "apple-mobile-web-app-status-bar-style",
          content: "default",
        },
        {
          name: "robots",
          content: "index, follow",
        },
        {
          name: "googlebot",
          content: "index, follow",
        },
      ],
      script: [
        {
          innerHTML: `
            (function() {
              try {
                var theme = localStorage.getItem('theme') || 'light';
                var isDark = theme === 'dark';
                var style = document.createElement('style');
                style.id = 'scrollbar-theme-init';
                if (isDark) {
                  style.textContent = '*{scrollbar-width:thin!important;scrollbar-color:#475569 #1e293b!important}::-webkit-scrollbar{width:6px!important;height:6px!important}::-webkit-scrollbar-track{background-color:#1e293b!important}::-webkit-scrollbar-thumb{background-color:#475569!important;border-radius:3px!important}::-webkit-scrollbar-thumb:hover{background-color:#64748b!important}';
                } else {
                  style.textContent = '*{scrollbar-width:thin!important;scrollbar-color:#cbd5e1 #f9fafb!important}::-webkit-scrollbar{width:6px!important;height:6px!important}::-webkit-scrollbar-track{background-color:#f9fafb!important}::-webkit-scrollbar-thumb{background-color:#cbd5e1!important;border-radius:3px!important}::-webkit-scrollbar-thumb:hover{background-color:#94a3b8!important}';
                }
                document.head.appendChild(style);
              } catch (e) {}
            })();
          `,
          type: "text/javascript",
        },
      ],
    },
  },

  css: ["~/assets/css/main.css"],

  postcss: {
    plugins: {
      "@tailwindcss/postcss": {},
      autoprefixer: {},
    },
  },

  vite: {
    server: {
      watch: {
        ignored: ["**/node_modules/**", "**/.git/**", "**/.output/**"],
      },
    },
    optimizeDeps: {
      include: [
        "@vue/devtools-core",
        "@vue/devtools-kit",
        "class-variance-authority",
        "@vueuse/core",
        "clsx",
        "reka-ui",
        "lucide-vue-next",
        "vue-sonner",
        "promise-polyfill",
        "smoothscroll", // CJS
        "floating-vue",
        "swiper",
        "swiper/modules",
        "@fancyapps/ui",
        "isomorphic-dompurify",
      ],
    },
    build: {
      sourcemap: false,
      // 使用 esbuild 进行压缩，比 terser 快 20-30 倍
      minify: "esbuild",
      // 减少转译开销
      target: "es2020",
      rollupOptions: {
        output: {
          manualChunks: {
            // Vue 相关
            vue: ["vue", "@vue/runtime-core", "@vue/runtime-dom"],
            // UI 组件库
            ui: ["reka-ui", "lucide-vue-next", "vue-sonner"],
            // 工具库
            utils: ["@vueuse/core", "clsx", "class-variance-authority"],
            // 媒体相关（swiper + fancyapps）
            media: ["swiper", "@fancyapps/ui"],
          },
        },
        // 忽略循环依赖警告以减少日志输出
        onwarn(warning, warn) {
          if (warning.code === "CIRCULAR_DEPENDENCY") return;
          warn(warning);
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  },

  hooks: {
    // 仅在 client build 时注入 visualizer，避免 server bundle 覆盖 stats.html
    "vite:extendConfig"(config, { isClient }) {
      if (!isClient) return;
      // @ts-expect-error 手动为 config 插入 visualizer 插件
      config.plugins = config.plugins || [];
      config.plugins.push(
        visualizer({
          filename: "stats.html",
          template: "treemap",
          gzipSize: true,
          brotliSize: true,
          emitFile: false,
        }),
      );
    },
  },

  nitro: {
    // 明确指定 preset，避免自动检测消耗
    preset: "node-server",

    // 资源预压缩：由 site.config.ts 的 build.brotliCompression 控制
    // 开启后同时生成 .br 和 .gz，需 Nginx 配合 brotli_static/gzip_static 或 CDN 直接发送
    compressPublicAssets: siteConfig.build.brotliCompression,

    // 禁用 Server-Timing 响应头，减少开销
    timing: false,

    // 按 site.config.ts 功能开关控制小程序 API 是否参与 Nitro 扫描/打包
    ignore: nitroIgnore,

    // 实验性功能优化
    experimental: {
      // 禁用 OpenAPI 文档生成以加快构建
      openAPI: false,
    },

    // ISR 缓存存储配置

    storage: {
      redis: redisConfig
        ? {
            driver: "redis",
            ...redisConfig,
          }
        : undefined,

      cache: redisConfig
        ? {
            driver: "redis",
            ...redisConfig,
          }
        : {
            driver: "fs",
            base: "./.nitro/cache",
          },

      fs: {
        driver: "fs",
        base: "./.data/storage",
      },
    },

    // Nitro 构建完成后复制运行时资源到统一目录 .output/server/runtime-assets/。
    // 与 scripts/copy-data.mjs 同源同目标：此 hook 保证裸 `nuxt build` 也能拷贝，
    // postbuild 脚本覆盖 `bun run build` 流程；两者幂等、结果一致。
    hooks: {
      compiled: async () => {
        const { mkdirSync, copyFileSync, existsSync } = await import("fs");
        const { join } = await import("path");

        const assetsDir = join(process.cwd(), "server", "runtime-assets");
        const targetDir = join(process.cwd(), ".output", "server", "runtime-assets");

        const runtimeFiles = [
          {
            source: process.env.QQWRY_IPDB_PATH || join(assetsDir, "qqwry.ipdb"),
            target: join(targetDir, "qqwry.ipdb"),
            label: "qqwry.ipdb database",
          },
          {
            source: join(assetsDir, "DejaVuSans.ttf"),
            target: join(targetDir, "DejaVuSans.ttf"),
            label: "captcha font",
          },
          {
            source: join(process.cwd(), "node_modules", "svg2png-wasm", "svg2png_wasm_bg.wasm"),
            target: join(targetDir, "svg2png_wasm_bg.wasm"),
            label: "svg2png WASM",
          },
        ];

        mkdirSync(targetDir, { recursive: true });
        for (const file of runtimeFiles) {
          if (!existsSync(file.source)) {
            console.warn(`⚠ ${file.label} not found: ${file.source}`);
            continue;
          }
          copyFileSync(file.source, file.target);
          console.log(`✓ Copied ${file.label} to .output/server/runtime-assets/`);
        }
      },
    },
  },
  // 安全头配置（仅生产环境）
  routeRules: {
    ...(siteConfig.features.miniApi
      ? {
          "/api/mini/**": {
            cors: true,
          },
        }
      : {}),
    // ========== ISR（增量静态再生成）配置 ==========
    // 注意：ISR在开发环境可能不稳定，建议生产环境启用
    ...(isProduction
      ? {
          // 首页：每5分钟重新生成一次（推荐）
          "/": {
            isr: 3600,
            // 显式指定使用 Redis 缓存存储（如果配置了 Redis）
            ...(redisConfig
              ? {
                  cache: {
                    maxAge: 3600,
                    base: "redis",
                  },
                }
              : {}),
          },

          // 文章归档：每10分钟重新生成
          "/archiving": {
            isr: 43200,
            ...(redisConfig
              ? {
                  cache: { maxAge: 43200, base: "redis" },
                }
              : {}),
          },

          // 分类页：每10分钟重新生成
          "/category/**": {
            isr: 3600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 3600, base: "redis" },
                }
              : {}),
          },

          // 文章详情：完全静态（发布后内容不变，永久缓存）
          "/content/**": {
            isr: true,
            ...(redisConfig
              ? {
                  cache: { base: "redis" },
                }
              : {}),
          },

          // 标签页：每15分钟重新生成
          "/tag/**": {
            isr: 3600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 3600, base: "redis" },
                }
              : {}),
          },

          // 订阅页：每10分钟重新生成
          "/subscribes": {
            isr: 3600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 3600, base: "redis" },
                }
              : {}),
          },

          // 更新日志：每30分钟重新生成
          "/changelogs": {
            isr: 3600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 3600, base: "redis" },
                }
              : {}),
          },

          // 协议页面：完全静态
          "/agreement": {
            isr: true,
            ...(redisConfig
              ? {
                  cache: { base: "redis" },
                }
              : {}),
          },

          // 站点地图：每小时重新生成
          "/sitemap": {
            isr: 3600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 3600, base: "redis" },
                }
              : {}),
          },
          "/sitemap.xml": {
            isr: 3600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 3600, base: "redis" },
                }
              : {}),
          },

          // 关于页：静态内容，每10分钟重新生成
          "/about": {
            isr: 600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 600, base: "redis" },
                }
              : {}),
          },

          // 旅行地图：静态内容，每10分钟重新生成
          "/map": {
            isr: 600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 600, base: "redis" },
                }
              : {}),
          },

          // 友链页：静态内容，每10分钟重新生成
          "/links": {
            isr: 600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 600, base: "redis" },
                }
              : {}),
          },

          // 留言板：动态内容，每10分钟重新生成
          "/messages": {
            isr: 600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 600, base: "redis" },
                }
              : {}),
          },

          // 搜索页：每10分钟重新生成
          "/search": {
            isr: 600,
            ...(redisConfig
              ? {
                  cache: { maxAge: 600, base: "redis" },
                }
              : {}),
          },
        }
      : {
          // 开发环境：如果配置了Redis则启用ISR，否则使用普通SSR
          ...(redisConfig
            ? {
                // 有Redis时启用ISR
                "/": {
                  isr: 30, // 5分钟
                  cache: { maxAge: 30, base: "redis" },
                },
                "/archiving": {
                  isr: 30, // 10分钟
                  cache: { maxAge: 30, base: "redis" },
                },
                "/category/**": {
                  isr: 30,
                  cache: { maxAge: 30, base: "redis" },
                },
                "/content/**": {
                  isr: 30,
                  cache: { maxAge: 30, base: "redis" },
                },
                "/tag/**": {
                  isr: 30, // 15分钟
                  cache: { maxAge: 30, base: "redis" },
                },
                "/subscribes": {
                  isr: 30,
                  cache: { maxAge: 30, base: "redis" },
                },
                "/changelogs": {
                  isr: 30, // 30分钟
                  cache: { maxAge: 30, base: "redis" },
                },
                "/agreement": {
                  isr: 30,
                  cache: { maxAge: 30, base: "redis" },
                },
                "/sitemap": {
                  isr: 30, // 1小时
                  cache: { maxAge: 30, base: "redis" },
                },
                "/sitemap.xml": {
                  isr: 30,
                  cache: { maxAge: 30, base: "redis" },
                },
                "/about": {
                  isr: 600,
                  cache: { maxAge: 600, base: "redis" },
                },
                "/map": {
                  isr: 600,
                  cache: { maxAge: 600, base: "redis" },
                },
                "/links": {
                  isr: 600,
                  cache: { maxAge: 600, base: "redis" },
                },
                "/messages": {
                  isr: 600,
                  cache: { maxAge: 600, base: "redis" },
                },
                "/search": {
                  isr: 600,
                  cache: { maxAge: 600, base: "redis" },
                },
              }
            : {
                // 没有Redis时禁用ISR，使用普通SSR
                "/": { isr: false },
                "/archiving": { isr: false },
                "/category/**": { isr: false },
                "/content/**": { isr: false },
                "/tag/**": { isr: false },
                "/subscribes": { isr: false },
                "/changelogs": { isr: false },
                "/agreement": { isr: false },
                "/sitemap": { isr: false },
                "/sitemap.xml": { isr: false },
                "/about": { isr: false },
                "/map": { isr: false },
                "/links": { isr: false },
                "/messages": { isr: false },
                "/search": { isr: false },
              }),
        }),

    // ========== SSR配置 ==========
    // 登录页面禁用 SSR，避免 hydration 不匹配
    "/login": {
      ssr: false,
    },

    // 管理后台：禁用ISR，保持实时数据
    "/admin/**": {
      isr: false,
      ssr: true,
    },

    // ========== 静态资源 CDN 重定向配置 ==========
    // 只有生产环境且配置了 CDN 时才启用重定向
    // 避免服务器处理文件不存在的请求，节省服务器资源
    ...(isProduction && siteConfig.cdnUrl && siteConfig.cdnUrl.startsWith("http")
      ? {
          "/favicon.ico": {
            redirect: {
              to: `${siteConfig.cdnUrl}/favicon.ico`,
              statusCode: 301,
            },
          },
          "/manifest.webmanifest": {
            redirect: {
              to: `${siteConfig.cdnUrl}/manifest.webmanifest`,
              statusCode: 301,
            },
          },
          // 注意：robots.txt 故意不走 CDN 重定向，作为 public/ 静态文件由
          // Nitro 直接返回——否则规则只对 CDN 子域生效，对本站失效。
          "/sitemap.xsl": {
            redirect: {
              to: `${siteConfig.cdnUrl}/sitemap.xsl`,
              statusCode: 301,
            },
          },
          "/imgs/**": {
            redirect: {
              to: `${siteConfig.cdnUrl}/imgs/**`,
              statusCode: 301,
            },
          },
          "/skills/**": {
            redirect: {
              to: `${siteConfig.cdnUrl}/skills/**`,
              statusCode: 301,
            },
          },
          "/icons/**": {
            redirect: {
              to: `${siteConfig.cdnUrl}/icons/**`,
              statusCode: 301,
            },
          },
          "/fonts/**": {
            redirect: {
              to: `${siteConfig.cdnUrl}/fonts/**`,
              statusCode: 301,
            },
          },
          "/emojis/**": {
            redirect: {
              to: `${siteConfig.cdnUrl}/emojis/**`,
              statusCode: 301,
            },
          },
          "/uploads/**": {
            redirect: {
              to: `${siteConfig.cdnUrl}/uploads/**`,
              statusCode: 301,
            },
          },
        }
      : {}),

    // ========== 全局安全头配置 ==========
    "/**": {
      headers: isProduction
        ? {
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "X-XSS-Protection": "1; mode=block",
          }
        : {
            // 开发环境下只配置必要的安全头，不设置 CSP
            "X-Frame-Options": "SAMEORIGIN",
            "X-Content-Type-Options": "nosniff",
          },
    },
  },
});
