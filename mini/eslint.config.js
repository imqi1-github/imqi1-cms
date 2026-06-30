import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

// mini/ 独立 ESLint 配置（与根项目 @nuxt/eslint 隔离）
// 根项目已通过 eslint.config.mjs 的 ignores 跳过 mini 目录，
// 此配置仅在 mini/ 内单独执行 `bun run lint` 时生效。
export default [
  {
    ignores: ['dist/**', 'unpackage/**', 'node_modules/**', 'src/uni_modules/**'],
  },

  // 先放 TypeScript：其 base 配置会全局注册 TS parser，
  // 必须在 pluginVue 之前，才能让后者对 .vue 的 file-scoped vue-eslint-parser 后置覆盖生效。
  ...tseslint.configs.recommended,

  // Vue 推荐规则（自动启用 vue-eslint-parser 解析 .vue）
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]
