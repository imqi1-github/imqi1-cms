export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  rootDir: ".",

  devServer: {
    port: 4000,
  },

  runtimeConfig: {
    public: {
      cdnURL: "http://cdn.imqi1.com",
    },
  },

  app: {
    head: {
      // 使用 runtime config 的 cdnURL（需要在 app.vue 或插件中动态设置）
      link: [{ rel: "stylesheet", href: "/fonts/font.css" }],
    },
    cdnURL: "http://cdn.imqi1.com",
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
        // "@vue/devtools-core",
        // "@vue/devtools-kit",
        // "class-variance-authority",
        // "@vueuse/core",
        // "clsx",
        // "tailwind-merge",
        // "reka-ui",
        // "lucide-vue-next",
        // "vue-sonner",
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
