export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  rootDir: ".",

  devServer: {
    port: 4000,
  },

  modules: ["shadcn-nuxt", "@nuxt/icon"],

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
        'vue-sonner',
      ],
    },
  },
});
