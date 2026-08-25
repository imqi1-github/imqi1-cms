import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt({
  ignores: [
    "node_modules",
    "mini"
  ],

  rules: {
    // =========================
    // Vue / Nuxt 规范
    // =========================
    "vue/multi-word-component-names": "off",
    "vue/no-v-html": "off",

    // script setup / composition API
    "vue/component-name-in-template-casing": ["error", "PascalCase"],
    "vue/padding-line-between-blocks": ["error", "always"],
    "vue/require-default-prop": "off",

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
  },
});
