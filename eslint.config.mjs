import withNuxt from "./.nuxt/eslint.config.mjs";
import tailwind from "eslint-plugin-tailwindcss";

export default withNuxt({
  ignores: [
    "scripts",
    "node_modules"
  ],
  plugins: {
    tailwindcss: tailwind,
  },

  rules: {
    // =========================
    // Vue / Nuxt 规范
    // =========================
    "vue/multi-word-component-names": "off",
    "vue/no-v-html": "warn",

    // script setup / composition API
    "vue/component-name-in-template-casing": ["error", "PascalCase"],
    "vue/padding-line-between-blocks": ["error", "always"],

    // =========================
    // TypeScript 规范
    // =========================
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],

    // =========================
    // import 规范（项目结构稳定性）
    // =========================
    "import/order": [
      "error",
      {
        groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        "newlines-between": "always",
      },
    ],

    // =========================
    // 通用 JS/TS
    // =========================
    '@typescript-eslint/no-unused-vars': 'error'
  },
});
