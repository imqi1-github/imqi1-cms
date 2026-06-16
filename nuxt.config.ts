import { existsSync, readFileSync } from "fs";
import { siteConfig, fullOgImage } from "./site.config";

// 读取构建 hash（如果存在）
const buildHashDir = existsSync(".build-hash-dir") ? `/${readFileSync(".build-hash-dir", "utf-8").trim()}` : "";

const cdnURL = buildHashDir ? `${siteConfig.cdnUrl}${buildHashDir}` : siteConfig.cdnUrl;

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
    public: {
      cdnURL: cdnURL,
      cdnBase: siteConfig.cdnUrl, // 不带 hash 的 CDN 根，用于 imgs/skills/icons/emojis 等静态资源
      buildHashDir: buildHashDir, // 保存 hash 目录供运行时使用
      rootDomain: siteConfig.rootDomain, // 防止反向代理的根域名
    },
  },

  modules: ["shadcn-nuxt", "@nuxt/icon", "@nuxtjs/color-mode", "@vite-pwa/nuxt"],

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
          src: "/imgs/imqi1.svg",
          sizes: "192x192",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
        {
          src: "/imgs/imqi1.svg",
          sizes: "512x512",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
      screenshots: [
        {
          src: "/imgs/frontend-screenshot1.png",
          sizes: "1280x720",
          type: "image/png",
          form_factor: "wide",
          label: "桌面端界面",
        },
        {
          src: "/imgs/frontend-screenshot2.png",
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
      // 缓存静态资源
      runtimeCaching: [
        {
          urlPattern: /\.(?:css|js|mjs)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "static-resources",
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
          href: import.meta.env.PROD && cdnURL ? `${cdnURL}/fonts/font.css` : "/fonts/font.css",
        },
        // PWA Manifest（仅在生产环境加载）
        ...(import.meta.env.PROD
          ? [{
              rel: "manifest",
              href: cdnURL ? `${cdnURL}/manifest.webmanifest` : "/manifest.webmanifest",
            }]
          : []),
        // Favicon（根据 CDN 配置动态生成）
        {
          rel: "icon",
          type: "image/x-icon",
          href: import.meta.env.PROD && cdnURL ? `${cdnURL}/favicon.ico` : "/favicon.ico",
        },
        // Apple Touch Icon（根据 CDN 配置动态生成）
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: import.meta.env.PROD && cdnURL ? `${cdnURL}/imgs/imqi1-144.png` : "/imgs/imqi1-144.png",
        },
      ],
      meta: [
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

  css: ["~/assets/css/main.css", "~/assets/css/aplayer.css"],

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
        "tailwind-merge",
        "reka-ui",
        "lucide-vue-next",
        "vue-sonner",
        "promise-polyfill",
        "smoothscroll", // CJS
        "floating-vue",
        "swiper",
        "swiper/modules",
        "@fancyapps/ui",
      ],
    },
    build: {
      sourcemap: false,
      // 使用 esbuild 进行压缩，比 terser 快 20-30 倍
      minify: 'esbuild',
      // 减少转译开销
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            // Vue 相关
            vue: ["vue", "@vue/runtime-core", "@vue/runtime-dom"],
            // UI 组件库
            ui: ["reka-ui", "lucide-vue-next", "vue-sonner"],
            // 工具库
            utils: ["@vueuse/core", "clsx", "tailwind-merge", "class-variance-authority"],
            // 媒体相关（swiper + fancyapps）
            media: ["swiper", "@fancyapps/ui"],
          },
        },
        // 忽略循环依赖警告以减少日志输出
        onwarn(warning, warn) {
          if (warning.code === 'CIRCULAR_DEPENDENCY') return;
          warn(warning);
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  },

  nitro: {
    // 明确指定 preset，避免自动检测消耗
    preset: "node-server",

    // 禁用资源预压缩（不生成 .br 和 .gz 文件）
    compressPublicAssets: false,

    // 禁用 Server-Timing 响应头，减少开销
    timing: false,

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

    // 复制根目录的 data 文件夹到构建输出（不经过 Vite 处理）
    publicAssets: [
      {
        baseURL: "/data",
        dir: "./data",
        maxAge: 60 * 60 * 24 * 365, // 1 year cache
      },
    ],

    // Nitro 构建完成后复制 data 目录
    hooks: {
      compiled: () => {
        const { mkdirSync, copyFileSync, existsSync } = require("fs");
        const { join } = require("path");

        const sourceDir = join(process.cwd(), "data");
        const targetDir = join(process.cwd(), ".output", "server", "data");

        if (existsSync(sourceDir)) {
          mkdirSync(targetDir, { recursive: true });
          copyFileSync(join(sourceDir, "qqwry.dat"), join(targetDir, "qqwry.dat"));
          console.log("✓ Copied qqwry.dat to .output/server/data/");
        }
      },
    },
  },
  // 安全头配置（仅生产环境）
  routeRules: {
    // ========== ISR（增量静态再生成）配置 ==========
    // 注意：ISR在开发环境可能不稳定，建议生产环境启用
    ...(import.meta.env.PROD
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

    // ========== 全局安全头配置 ==========
    "/**": {
      headers: import.meta.env.PROD
        ? {
            // 生产环境下的 CSP 配置
            "Content-Security-Policy":
              `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${siteConfig.cdnUrl}; style-src 'self' 'unsafe-inline' ${siteConfig.cdnUrl}; img-src 'self' data: https: ${siteConfig.cdnUrl}; font-src 'self' data: ${siteConfig.cdnUrl}; connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; media-src 'self' https: data: blob:; object-src 'none'; base-uri 'self'; form-action 'self';`,
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
