import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// 读取构建 hash（如果存在）
const buildHashDir = existsSync('.build-hash-dir')
  ? `/${readFileSync('.build-hash-dir', 'utf-8').trim()}`
  : '';

const cdnBaseURL = 'https://cdn2.imqi1.com';
const cdnURL = buildHashDir ? `${cdnBaseURL}${buildHashDir}` : cdnBaseURL;

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  rootDir: ".",

  // 禁用 sourcemap 以减少构建时间和内存占用
  sourcemap: false,

  devServer: {
    port: 4000,
  },

  runtimeConfig: {
    public: {
      cdnURL: cdnURL,
      buildHashDir: buildHashDir, // 保存 hash 目录供运行时使用
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
    // 开发环境禁用 PWA
    devOptions: {
      enabled: false,
    },
    // 生产环境配置
    manifest: {
      name: "ImQi1",
      short_name: "ImQi1",
      description: "做技术的分享者、生活的摄影师、时事的评论员。",
      theme_color: "#f9fafb",
      background_color: "#ffffff",
      display: "fullscreen",
      lang: "zh-CN",
      start_url: "https://imqi1.qi1.website",
      id: "/",
      scope: "/",
      icons: [
        {
          src: "/imgs/imqi1-svg",
          sizes: "192x192",
          type: "image/svg+xml",
          purpose: "any maskable"
        },
        {
          src: "/imgs/imqi1-svg",
          sizes: "512x512",
          type: "image/svg+xml",
          purpose: "any maskable"
        },
      ],
      screenshots: [
        {
          src: "/imgs/frontend-screenshot1.png",
          sizes: "1280x720",
          type: "image/png",
          form_factor: "wide",
          label: "桌面端界面"
        },
        {
          src: "/imgs/frontend-screenshot2.png",
          sizes: "510x820",
          type: "image/png",
          form_factor: "narrow",
          label: "移动端界面"
        }
      ],
    },
    workbox: {
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
                  style.textContent = 'html{scrollbar-gutter:stable!important}*{scrollbar-width:thin!important;scrollbar-color:#475569 #1e293b!important}::-webkit-scrollbar{width:6px!important;height:6px!important}::-webkit-scrollbar-track{background-color:#1e293b!important}::-webkit-scrollbar-thumb{background-color:#475569!important;border-radius:3px!important}::-webkit-scrollbar-thumb:hover{background-color:#64748b!important}';
                } else {
                  style.textContent = 'html{scrollbar-gutter:stable!important}*{scrollbar-width:thin!important;scrollbar-color:#cbd5e1 #f9fafb!important}::-webkit-scrollbar{width:6px!important;height:6px!important}::-webkit-scrollbar-track{background-color:#f9fafb!important}::-webkit-scrollbar-thumb{background-color:#cbd5e1!important;border-radius:3px!important}::-webkit-scrollbar-thumb:hover{background-color:#94a3b8!important}';
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
        "smoothscroll",
      ],
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            // Vue 相关
            vue: ["vue", "@vue/runtime-core", "@vue/runtime-dom"],
            // UI 组件库
            ui: ["reka-ui", "lucide-vue-next", "vue-sonner"],
            // 工具库
            utils: ["@vueuse/core", "clsx", "tailwind-merge", "class-variance-authority"],
            // 图标
            icons: ["@iconify/vue"],
          },
        },
      },
      chunkSizeWarningLimit: 800,
    },
  },

  nitro: {
    compressPublicAssets: true,
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
});