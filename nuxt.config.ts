export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  rootDir: ".",

  devServer: {
    port: 4000,
  },

  runtimeConfig: {
    public: {
      cdnURL: "https://cdn.imqi1.com",
    },
  },

  app: {
    cdnURL: "https://cdn.imqi1.com",
  },

  // ISR 预渲染配置 - 大幅降低 TTFB
  routeRules: {
    // 首页和内容页面使用 ISR，每 5 分钟重新生成一次
    "/": { isr: 300 },
    "/category/**": { isr: 300 },
    "/page/**": { isr: 3600 },
    "/post/**": { isr: 300 },
    // API 缓存
    "/api/site": { cache: { maxAge: 300 } },
    "/api/categories": { cache: { maxAge: 300 } },
    "/api/links": { cache: { maxAge: 600 } },
  },

  modules: ["shadcn-nuxt", "@nuxt/icon", "@nuxtjs/color-mode"],

  colorMode: {
    classSuffix: "",
    fallback: "light",
    storageKey: "theme",
  },

  shadcn: {
    prefix: "",
    componentDir: "./app/components/ui",
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
        ignored: ['**/node_modules/**', '**/.git/**', '**/.output/**']
      }
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
});
