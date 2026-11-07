import { randomBytes } from "crypto";

import { visualizer } from "rollup-plugin-visualizer";

import { siteConfig } from "./site.config";
import { CDN_CACHED_ROUTES, PUBLIC_STATIC_API_ROUTES } from "./shared/constants";
import { isListPageRoutePattern } from "./shared/cache-routes";
import { getRedisConfig } from "./shared/redis-config";

const isProduction = process.env.NODE_ENV === "production";

// —— 构建哈希:时间(YYYYMMDDHHmmss)+ 8位随机,用作 CDN 资产目录 static/<hash>
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function genBuildHash(): string {
  // 开发环境没有真正的构建产物版本号：资产走本地 _nuxt/、无 CDN hash 目录（见 buildHashDir），
  if (!isProduction) return "开发版";
  const d = new Date();
  const ts =
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${ts}-${randomBytes(4).toString("hex")}`;
}
const buildHash = genBuildHash();
// 仅生产用 hash 作 CDN 资产目录;开发模式 buildHashDir 为空(资产走本地 _nuxt/,与旧版无 hash 文件一致)
const buildHashDir = isProduction ? `/static/${buildHash}` : "";

const hasCdn =
  siteConfig.site.cdnUrl && siteConfig.site.cdnUrl.startsWith("http");
const cdnURL =
  isProduction && hasCdn
    ? `${siteConfig.site.cdnUrl}${buildHashDir}`
    : siteConfig.site.cdnUrl;
// 绝对 URL 原样返回，避免调用点对「定义处已带前缀」的值二次拼接
const ABSOLUTE_RE = /^(https?:)?\/\//i;
const publicCdnAsset = (p: string) =>
  isProduction && hasCdn && !ABSOLUTE_RE.test(p)
    ? `${siteConfig.site.cdnUrl}${p}`
    : p;
const nitroIgnore = siteConfig.features.miniApi ? [] : ["api/mini/**"];
const redisConfig = getRedisConfig();
const SEARCH_PAGE_CACHE_SECONDS = 60 * 5;
// 源站页面缓存时长（site.config build.pageCacheSeconds，默认 6 小时）。
// 它只决定源站多久重渲染一次：边缘「缓存预刷新」回源验证时若命中源站缓存 → 只回 304。
// 边缘侧的新鲜度上界是 build.edgeCacheSeconds（默认 1 小时），两者刻意分开。
const PAGE_CACHE_SECONDS = siteConfig.build.pageCacheSeconds;
// 内容页的边缘 TTL（远小于源站）：边缘到期回源验证命中源站缓存只回 304，不增加渲染量
const EDGE_CACHE_SECONDS = siteConfig.build.edgeCacheSeconds;
// 列表/统计页的缓存时长（源站 + 边缘都用它）：短 TTL 让评论数等聚合数据尽快收敛
const LIST_PAGE_SECONDS = siteConfig.build.listPageCacheSeconds;

// 每条页面规则 = 源站 ISR（配了 Redis 才有）+ CDN 边缘缓存头
//
// 列表/统计页（首页/分类/标签/归档/关于/站点地图）内嵌评论数等聚合数据，
// 写库后不提交边缘刷新，靠**边缘 TTL 短**收敛。
// 源站缓存保持长（pageCacheSeconds）：写库时删掉对应缓存键，下次回源即重新渲染，
// 源站渲染频率不变；边缘 TTL 短只是让边缘更频繁地来问一次（命中源站缓存，很便宜）。
const pageCacheRules = Object.fromEntries(
  CDN_CACHED_ROUTES.map(path => {
    // 档位判定与运行时的响应头插件走同一份实现（shared/cache-routes），
    // 否则两套逻辑分叉时同一页面会被下发不同 TTL
    const edgeMaxAge = isListPageRoutePattern(path) ? LIST_PAGE_SECONDS : EDGE_CACHE_SECONDS;
    return [
      path,
      {
        // 源站缓存层：配了 Redis 用 Redis，没配就用文件缓存（.nitro/cache）——都不需要额外组件。
        // 开发环境不挂缓存（改了数据要立刻能看到），与 server/utils/cache/store.ts 的口径一致。
        ...(isProduction
          ? redisConfig
            ? { isr: PAGE_CACHE_SECONDS, cache: { maxAge: PAGE_CACHE_SECONDS, base: "redis" } }
            : { cache: { maxAge: PAGE_CACHE_SECONDS, base: "cache" } }
          : {}),
        ...(isProduction ? { headers: { "Cache-Control": `public, max-age=0, s-maxage=${edgeMaxAge}` } } : {}),
      },
    ];
  }),
);

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
    redis: redisConfig ?? { host: "", port: 0, db: 0, lazyConnect: false },
    amapUseServerProxy: isProduction && siteConfig.features.amap.proxy,
    mcpEnabled: siteConfig.features.mcp,
    buildHash: buildHash,
    public: {},
  },

  modules: [
    "shadcn-nuxt",
    "@nuxt/icon",
    "@nuxtjs/color-mode",
    "@vite-pwa/nuxt",
    "@nuxt/eslint",
  ],

  icon: {
    serverBundle: "local",
    fallbackToApi: false,
    customCollections: [
      {
        prefix: "app",
        dir: "./app/assets/icons",
      },
    ],
    clientBundle: {
      icons: [
        "ri:mail-fill",
        "ri:github-fill",
        "ri:twitter-x-fill",
        "ri:home-fill",
        "ri:subway-fill",
        "ri:earth-fill",
        "app:nuxt",
        "app:prisma",
        "app:postgresql",
        "app:nuxt-wordmark",
        "app:prisma-wordmark",
        "ri:stack-line",
        "app:tailwind",
        "app:typescript",
        "app:linux",
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
    workbox: {
      globPatterns: ["favicon.ico", "fonts/font.css"],
      globIgnores: ["**/node_modules/**/*", "sw.js", "builds/**"],
      navigateFallback: null,
      inlineWorkboxRuntime: true,
      // 缓存静态资源
      runtimeCaching: [
        {
          urlPattern: /\.(?:css|js|mjs)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "static-resources",
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
              maxAgeSeconds: 60 * 60 * 24 * 365,
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
              maxAgeSeconds: 60 * 60 * 24 * 365,
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
              maxAgeSeconds: 60 * 60 * 24 * 365,
            },
          },
        },
      ],
    },
  },

  app: {
    baseURL: "/",
    buildAssetsDir: isProduction ? "/" : "_nuxt/",
    cdnURL: cdnURL,
    head: {
      htmlAttrs: {
        lang: "zh-CN",
      },
      link: [
        {
          rel: "preconnect",
          href: siteConfig.site.cdnUrl,
        },
        {
          rel: "dns-prefetch",
          href: siteConfig.site.cdnUrl,
        },
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: "RSS 订阅",
          href: "/feed",
        },
        {
          rel: "stylesheet",
          href: publicCdnAsset("/fonts/font.css"),
        },
        ...(isProduction
          ? [
              {
                rel: "manifest",
                href: publicCdnAsset("/manifest.webmanifest"),
              },
            ]
          : []),
        {
          rel: "icon",
          type: "image/x-icon",
          href: publicCdnAsset("/favicon.ico"),
        },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: publicCdnAsset("/imgs/imqi1-144.png"),
        },
      ],
      meta: [
        {
          name: "author",
          content: siteConfig.site.name,
        },
        {
          property: "og:site_name",
          content: siteConfig.site.name,
        },
        {
          property: "og:image",
          content: publicCdnAsset(siteConfig.seo.ogImage),
        },
        {
          property: "og:locale",
          content: siteConfig.seo.ogLocale,
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:image",
          content: publicCdnAsset(siteConfig.seo.ogImage),
        },
        {
          name: "twitter:site",
          content: siteConfig.seo.twitterSite,
        },
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
          manualChunks(id) {
            if (
              id.includes("node_modules/vue/") ||
              id.includes("node_modules/@vue/runtime-")
            )
              return "vue";
            if (
              id.includes("node_modules/reka-ui") ||
              id.includes("node_modules/lucide-vue-next") ||
              id.includes("node_modules/vue-sonner")
            )
              return "ui";
            if (
              id.includes("node_modules/@vueuse/") ||
              id.includes("node_modules/clsx") ||
              id.includes("node_modules/class-variance-authority")
            )
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
    preset: "node-server",
    compressPublicAssets: siteConfig.build.brotliCompression,
    timing: false,
    ignore: nitroIgnore,
    experimental: {
      openAPI: false,
    },
    storage: {
      // Nuxt 的 payload 缓存用 URL 做键，unstorage normalizeKey 会在 ? 处截断：
      // 根路径带查询串（/?utm=…）得到空键，fs 驱动会去 open 目录本身 → EISDIR 500。
      // 换成 memory 驱动即可（内存键允许空串），不影响页面缓存。
      "cache:nuxt:payload": { driver: "memory" },
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
    hooks: {
      compiled: async () => {
        const { mkdirSync, copyFileSync, existsSync, cpSync, readdirSync } = await import("fs");
        const { join } = await import("path");
        const assetsDir = join(process.cwd(), "server", "runtime-assets");
        const targetDir = join(
          process.cwd(),
          ".output",
          "server",
          "runtime-assets",
        );
        const runtimeFiles = [
          {
            source: join(assetsDir, "qqwry.ipdb"),
            target: join(targetDir, "qqwry.ipdb"),
            label: "qqwry.ipdb database",
          },
          {
            source: join(assetsDir, "DejaVuSans.ttf"),
            target: join(targetDir, "DejaVuSans.ttf"),
            label: "captcha font",
          },
          {
            source: join(
              process.cwd(),
              "node_modules",
              "svg2png-wasm",
              "svg2png_wasm_bg.wasm",
            ),
            target: join(targetDir, "svg2png_wasm_bg.wasm"),
            label: "svg2png WASM",
          },
          {
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
          console.log(
            `✓ Copied ${file.label} to .output/server/runtime-assets/`,
          );
        }

        // nft 偶尔漏拷 runtime 依赖(动态 import / polyfill / driver-adapter)。
        // 上传 .output/server/ 到生产后,Nitro 进程用 .output/server/node_modules/<pkg>
        // 解析这些包;一旦漏,生产即报 ERR_MODULE_NOT_FOUND。
        // 这里硬列白名单,nft 没拷就从根 node_modules 补拷;不依赖 nft 行为。
        const runtimeNodeModules = join(process.cwd(), ".output", "server", "node_modules");
        // WHY: 这些包的 transitive(@prisma/adapter-pg / pg / node-fetch / isomorphic-dompurify)
        // nft 经常漏拷(动态 require / 间接 import)。每次发版前遇到新的就追加进此处。
        // 同样:Dockerfile 的 `COPY --from=builder /app/node_modules/undici ...` 也是同一处理。
        const mustHaveDeps = [
          { pkg: "undici", label: "isomorphic-dompurify / fetch polyfill" },
          { pkg: "whatwg-url", label: "node-fetch / undici transitive" },
          { pkg: "postgres-array", label: "@prisma/adapter-pg deps" },
          { pkg: "postgres-bytea", label: "pg-types deps" },
          { pkg: "postgres-date", label: "pg-types deps" },
          { pkg: "postgres-interval", label: "pg-types deps" },
        ];
        mkdirSync(runtimeNodeModules, { recursive: true });
        for (const { pkg, label } of mustHaveDeps) {
          const dest = join(runtimeNodeModules, pkg);
          if (existsSync(join(dest, "package.json"))) continue;
          const src = join(process.cwd(), "node_modules", pkg);
          if (!existsSync(join(src, "package.json"))) {
            console.warn(`⚠ 根 node_modules 也缺 ${pkg}(${label}),跳过`);
            continue;
          }
          cpSync(src, dest, { recursive: true });
          console.log(`✓ nft 漏拷 → 补拷 ${pkg}(${label})到 .output/server/node_modules/`);
        }

        // nft 把部分包软链到 .nitro/ 缓存目录,且不止顶层:markdown-it/node_modules/entities、
        // pg-types/node_modules/postgres-array 等嵌套位置也有(共 7+ 处)。
        // SFTP 上传到生产后软链指向本地 Windows 路径(如 /x/imqi1-cms/...),
        // 生产机无此路径 → 软链悬空 → ERR_MODULE_NOT_FOUND(/feed 500 就是 markdown-it 解析不到 entities)。
        // 这里递归扫 .output/server/node_modules/ 全树,把所有软链解成真实目录;
        // 解完再走进解出的目录继续扫(目标内部可能还有软链)。
        const { lstatSync, readlinkSync, rmSync } = await import("fs");
        const { dirname, resolve } = await import("path");
        const derefAll = (dir: string, depth = 0): void => {
          for (const ent of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, ent.name);
            if (lstatSync(p).isSymbolicLink()) {
              // readlink 只给原始串：相对软链（如 ../foo）必须按链接所在目录解析，按 CWD 解会误判悬空
              const target = resolve(dirname(p), readlinkSync(p));
              if (!existsSync(target)) {
                console.warn(`⚠ 软链悬空 → ${p} -> ${target}`);
                continue;
              }
              rmSync(p, { recursive: true, force: true });
              cpSync(target, p, { recursive: true });
              console.log(`✓ 软链解实目录 ${p.replace(process.cwd(), "")} (→ ${target.split(/[\\/]/).pop()})`);
              // depth 只在解软链时递增：环必然经过软链边，普通目录层级不设限
              if (depth < 10) derefAll(p, depth + 1);
            } else if (ent.isDirectory()) {
              derefAll(p, depth);
            }
          }
        };
        derefAll(runtimeNodeModules);
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
    ...pageCacheRules,

    // 搜索页：SSR 结果随查询词变化，只在源站缓存（配了 Redis 才有），不进 CDN 边缘缓存
    // TTL 对齐站内搜索的短缓存（默认 5 分钟）：写库也会清掉这类键，这里只是兜底上界
    "/search": {
      ...(redisConfig
        ? { isr: SEARCH_PAGE_CACHE_SECONDS, cache: { maxAge: SEARCH_PAGE_CACHE_SECONDS, base: "redis" } }
        : {}),
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },

    // Feed（RSS）：5 分钟缓存，防订阅器轮询每次全表扫 content 大字段；
    // 新文章上线最多延迟 5 分钟出现在订阅端，可接受
    // 开发环境不挂缓存：本地改完要立刻看到（与 server/utils/cache/store.ts 同口径）
    "/feed/**": {
      ...(isProduction
        ? {
            cache: { maxAge: 300, base: redisConfig ? "redis" : "cache" },
            headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
          }
        : {}),
    },

    // 热力图聚合（全量文章+已审核评论按天聚合）：60s 缓存，
    // query 进缓存键，分类/标签筛选组合各自独立；数据滞后 ≤1 分钟可接受
    "/api/heatmap": {
      ...(isProduction
        ? {
            cache: { maxAge: 60, base: redisConfig ? "redis" : "cache" },
            headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
          }
        : {}),
    },

    // 变化很少的公开接口：加源站缓存，配合 ETag → 边缘预刷新回源验证只命中缓存（几毫秒），
    // 不必每次跑 DB。刻意只列「读公开数据、变化很少」的接口：
    // 列表类/计数类（home-data、comments、likes/counts…）变化快，不进缓存，避免前台看到滞后数据。
    // Redis 与文件两种后端都要挂：否则配了 Redis 时这些接口没有源站缓存，边缘预刷新会直接打 DB。
    ...(isProduction
      ? Object.fromEntries(
          PUBLIC_STATIC_API_ROUTES.map(path => [
            path,
            { cache: { maxAge: 60, base: redisConfig ? "redis" : "cache" } },
          ]),
        )
      : {}),

    // 登录页面禁用 SSR，避免 hydration 不匹配；登录页绝不能进 CDN 缓存
    "/login": {
      ssr: false,
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },

    // 管理后台：禁用ISR，保持实时数据；后台绝不能进 CDN 缓存
    "/admin/**": {
      isr: false,
      ssr: true,
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },

    // 认证与后台接口同理：带用户态，绝不能进边缘缓存
    "/api/auth/**": {
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },
    "/api/admin/**": {
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },

    // 动态/与访客相关的接口：源站显式 no-store，不依赖边缘控制台规则兜底
    // （/api/contents/likes/** 的 liked 按访客指纹算；/api/comments 实时；/api/search 按查询词；/api/check-link 实时探测）
    "/api/comments": {
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },
    "/api/search": {
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },
    "/api/check-link": {
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },
    "/api/contents/likes/**": {
      ...(isProduction ? { headers: { "Cache-Control": "no-store" } } : {}),
    },
    ...(isProduction &&
    siteConfig.site.cdnUrl &&
    siteConfig.site.cdnUrl.startsWith("http")
      ? {
          "/favicon.ico": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/favicon.ico`,
              statusCode: 301,
            },
          },
          "/manifest.webmanifest": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/manifest.webmanifest`,
              statusCode: 301,
            },
          },
          "/imgs/**": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/imgs/**`,
              statusCode: 301,
            },
          },
          "/skills/**": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/skills/**`,
              statusCode: 301,
            },
          },
          "/icons/**": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/icons/**`,
              statusCode: 301,
            },
          },
          "/fonts/**": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/fonts/**`,
              statusCode: 301,
            },
          },
          "/emojis/**": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/emojis/**`,
              statusCode: 301,
            },
          },
          "/uploads/**": {
            redirect: {
              to: `${siteConfig.site.cdnUrl}/uploads/**`,
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
            "Permissions-Policy":
              "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "X-XSS-Protection": "1; mode=block",
          }
        : {
            "X-Frame-Options": "SAMEORIGIN",
            "X-Content-Type-Options": "nosniff",
          },
    },
  },
});
