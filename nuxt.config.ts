import { randomBytes } from "crypto";

import { visualizer } from "rollup-plugin-visualizer";

import { siteConfig, fullOgImage } from "./site.config";
import { getRedisConfig } from "./shared/redis-config";

const isProduction = process.env.NODE_ENV === "production";

// —— 构建哈希:时间(YYYYMMDDHHmmss)+ 8位随机,用作 CDN 资产目录 static/<hash> ——
// 每轮 build 模块加载时生成一次(同一构建内稳定)。不再写根目录 .build-hash 文件,
// 改为构建完成后由 build:done hook 落盘 .output/build-hash.json 供部署脚本读取。
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function genBuildHash(): string {
  // 开发环境没有真正的构建产物版本号：资产走本地 _nuxt/、无 CDN hash 目录（见 buildHashDir），
  // 别展示虚假的"时间戳-随机串"，统一显示"开发版"；生产环境才生成真实 hash。
  if (!isProduction) return "开发版";
  const d = new Date();
  const ts =
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` + `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${ts}-${randomBytes(4).toString("hex")}`;
}
const buildHash = genBuildHash();
// 仅生产用 hash 作 CDN 资产目录;开发模式 buildHashDir 为空(资产走本地 _nuxt/,与旧版无 hash 文件一致)
const buildHashDir = isProduction ? `/static/${buildHash}` : "";

const hasCdn = siteConfig.cdnUrl && siteConfig.cdnUrl.startsWith("http");
const cdnURL = isProduction && hasCdn ? `${siteConfig.cdnUrl}${buildHashDir}` : siteConfig.cdnUrl;
const publicCdnAsset = (p: string) => (isProduction && hasCdn ? `${siteConfig.cdnUrl}${p}` : p);
// CSP 已改为运行时按每请求 nonce 生成、通过 HTTP 响应头投递（不再用静态 <meta>），
// 见 server/utils/csp.ts（策略拼装）+ server/plugins/csp.ts（render:response 注入 nonce 与设头）
const nitroIgnore = siteConfig.features.miniApi ? [] : ["api/mini/**"];

// 获取当前环境的 Redis 配置（逻辑在 shared/redis-config.ts，供 nitro ISR 存储与 server 缓存共用）
const redisConfig = getRedisConfig();

// ISR 全局缓存 TTL：统一 30 分钟（routeRules 各路由的 isr 与 cache.maxAge 共用这一值）。
// 旧配置曾按路由区分（1h / 12h / 10min / 永久），现已全部统一；后续调整缓存时长只改这里。
const ISR_CACHE_SECONDS = 60 * 30;

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
  //   port: 3000,
  // },

  runtimeConfig: {
    // 高德 key/securityCode 不烘焙进包：运行时由服务端从 process.env 读取
    //（见 server/routes/_AMapService 与 server/api/amap/config）。
    // Redis 配置：构建期从 REDIS_*_DEV/_PROD 解析并烘焙（见 shared/redis-config.ts）。
    // 生产运行时不再读取任何 Redis 环境变量；搜索缓存统一从这里取值，
    // ISR 缓存走上方 nitro storage / routeRules 的同一份 redisConfig（两者共用）。
    // 未配置时 getRedisConfig() 返回 null，这里兜成一个 host 为空的零对象：
    // 保证值始终是对象——untyped 据此生成对象类型（否则 Nuxt 会把未设置的键
    // 默认成 "" 字符串，运行时配置类型会漂移成 string）。是否启用由
    // server/utils/redis.ts 的 redisConfig.host 判定（空 host 视为关闭），
    // 而上方 storage/routeRules 的启停仍直接用 getRedisConfig() 的原生 null。
    redis: redisConfig ?? { host: "", port: 0, password: undefined, db: 0, lazyConnect: false },
    // 非 public：仅服务端可读，不进 __NUXT__（浏览器拿不到）。高德是否走服务端代理，
    // 仅生产且站点开启代理时为 true；服务端 _AMapService / amap/config 据此放行。
    amapUseServerProxy: isProduction && siteConfig.amap.useServerProxy,
    // 非 public 构建哈希：仅服务端 / 部署脚本可读，不进 __NUXT__；
    // 由 /api/site 下发，前端 useSiteSettings 内 getBuildHash 缓存供 meta/页脚/后台展示。
    buildHash: buildHash,
    public: {},
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
    // 用于承接品牌 logo（Nuxt/Prisma/PostgreSQL/Google 等），SSR 本地渲染，
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
        "app:postgresql",
        // 首页技术栈大字标（客户端路由切换进入首页时无 SSR payload）。
        "app:nuxt-wordmark",
        "app:prisma-wordmark",
        // 首页架构图中心 hub 图标 + 新增节点品牌图标（节点 app:nuxt/prisma/postgresql 已在上方内联）。
        "ri:stack-line",
        "app:tailwind",
        "app:typescript",
        // 评论列表设备信息图标为动态 :name 绑定，scan 扫不到，
        // 且评论多为客户端异步加载，内联避免运行时请求。
        "app:linux",
        // 图片灯箱工具栏：内容 v-if 到点击后才渲染，SSR 永远覆盖不到，
        // 不内联则首次打开会逐个回退 /api/_nuxt_icon 并闪一下。
        "lucide:zoom-in",
        "lucide:zoom-out",
        "lucide:maximize",
        "lucide:rotate-ccw",
        "lucide:rotate-cw",
        "lucide:flip-horizontal",
        "lucide:flip-vertical",
        "lucide:undo-2",
        "lucide:layout-grid",
        "lucide:x",
        "lucide:chevron-left",
        "lucide:chevron-right",
        "lucide:image-off",
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
    registerType: "prompt",
    devOptions: {
      enabled: false,
    },
    // manifest 不在此生成：一旦给了 manifest 配置，@vite-pwa/nuxt 就会生成 /manifest.webmanifest
    // 并在构建时覆盖 public/manifest.webmanifest（于是改 public 那份不生效）。这里改为以
    // public/manifest.webmanifest 静态文件为唯一来源（由 CDN 回源/上传到根目录）。
    // 故此处不设 manifest —— 模块无默认值，不生成；SW/workbox 与 <link rel=manifest>（在 app.head）不受影响。
    workbox: {
      globPatterns: ["manifest.webmanifest", "favicon.ico", "fonts/font.css"],
      globIgnores: ["**/node_modules/**/*", "sw.js", "builds/**"],
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
    // 构建产物扁平化：直接放在 cdnURL 根下（如 /static/<hash>/entry.<hash>.js），去掉 _nuxt/ 层级
    buildAssetsDir: isProduction ? "/" : "_nuxt/",
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
        "isomorphic-dompurify",
        // 富文本编辑器（ESM，预打包避免 dev 首屏重组）
        // 注：@tiptap/pm 无根导出（仅子路径如 @tiptap/pm/model），不能放进 include；
        // 它会被上面的 @tiptap/core / @tiptap/vue-3 间接预打包。
        "@tiptap/vue-3",
        "@tiptap/core",
        "@tiptap/starter-kit",
        "tiptap-markdown",
        "ogl",
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
          // manualChunks 用函数形式（Vite 8/Rolldown 只认函数；Vite 7/Rollup 两者皆可），
          // 按模块 id 匹配包名，等价于原对象写法 { vue: [...], ui: [...] }。
          // 富文本编辑器（Tiptap/ProseMirror）仍不设 manual chunk：避免共享 CJS
          // helper 被并进 tiptap 块，导致首页动态加载 APlayer 时整包拉取 ~500KB。
          manualChunks(id) {
            if (id.includes("node_modules/vue/") || id.includes("node_modules/@vue/runtime-")) return "vue";
            if (id.includes("node_modules/reka-ui") || id.includes("node_modules/lucide-vue-next") || id.includes("node_modules/vue-sonner"))
              return "ui";
            if (id.includes("node_modules/@vueuse/") || id.includes("node_modules/clsx") || id.includes("node_modules/class-variance-authority"))
              return "utils";
            if (id.includes("node_modules/swiper")) return "media";
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
    // 仅在 client build 且开启 siteConfig.build.statsHtml 时注入 visualizer
    // （默认关闭，避免每次构建都生成 stats.html；排查包体积时打开）
    "vite:extendConfig"(config, { isClient }) {
      if (!isClient || !siteConfig.build.statsHtml) return;
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
          {
            // 邮件 CID 表情渲染（server/utils/emoji-mail.ts）运行时 fs 读取；Nitro 不打包 app/，须显式复制到 runtime-assets。
            source: join(process.cwd(), "app", "assets", "emojis.json"),
            target: join(targetDir, "emojis.json"),
            label: "emojis.json (mail emoji)",
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
          // 各路由缓存统一为 ISR_CACHE_SECONDS（30 分钟）：改动内容最迟 30 分钟内全站可见。
          // 首页
          "/": {
            isr: ISR_CACHE_SECONDS,
            // 显式指定使用 Redis 缓存存储（如果配置了 Redis）
            ...(redisConfig
              ? {
                  cache: {
                    maxAge: ISR_CACHE_SECONDS,
                    base: "redis",
                  },
                }
              : {}),
          },

          // 文章归档
          "/archiving": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 分类页
          "/category/**": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 文章详情（原"完全静态/永久缓存"，统一为30分钟：新发布文章最迟30分钟内可见）
          "/content/**": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 标签页
          "/tag/**": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 订阅页
          "/subscribes": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 更新日志
          "/changelogs": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 协议页面（原"完全静态"，统一为30分钟）
          "/agreement": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 站点地图
          "/sitemap": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },
          "/sitemap.xml": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 关于页
          "/about": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 旅行地图
          "/map": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 友链页
          "/links": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 留言板
          "/messages": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },

          // 搜索页
          "/search": {
            isr: ISR_CACHE_SECONDS,
            ...(redisConfig
              ? {
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                }
              : {}),
          },
        }
      : {
          // 开发环境：如果配置了Redis则启用ISR，否则使用普通SSR
          ...(redisConfig
            ? {
                // 有Redis时启用ISR（统一30分钟，与生产一致）
                "/": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/archiving": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/category/**": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/content/**": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/tag/**": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/subscribes": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/changelogs": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/agreement": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/sitemap": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/sitemap.xml": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/about": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/map": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/links": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/messages": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
                },
                "/search": {
                  isr: ISR_CACHE_SECONDS,
                  cache: { maxAge: ISR_CACHE_SECONDS, base: "redis" },
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
