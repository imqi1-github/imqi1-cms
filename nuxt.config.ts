export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  rootDir: ".",

  devServer: {
    port: 4000,
  },

  app: {
    head: {
      link: [{ rel: "stylesheet", href: "/fonts/font.css" }],
    },
    cdnURL: process.env.CDN_URL || undefined,
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
      rollupOptions: {
        output: {
          manualChunks: {
            // Vue 相关
            vue: ["vue", "@vue/runtime-core", "@vue/runtime-dom"],
            // Nuxt 相关
            nuxt: ["@nuxt/app", "@nuxt/kit", "@nuxt/schema"],
            // UI 组件库
            ui: ["reka-ui", "lucide-vue-next", "vue-sonner"],
            // 工具库
            utils: ["@vueuse/core", "clsx", "tailwind-merge", "class-variance-authority"],
            // 图标
            icons: ["@iconify/vue"],
            // Markdown 相关
            markdown: ["markdown-it", "shiki"],
          },
        },
      },
      chunkSizeWarningLimit: 500,
    },
  },
});
