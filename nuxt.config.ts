export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  devServer: {
    port: 4000,
  },

  modules: ["shadcn-nuxt"],

  shadcn: {
    prefix: "",
    componentDir: "./components/ui",
  },

  css: ["~/assets/css/main.css"],

  postcss: {
    plugins: {
      "@tailwindcss/postcss": {},
      autoprefixer: {},
    },
  },
});