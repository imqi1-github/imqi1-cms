# imqi1 小程序端

基于 **uni-app (Vue 3 + Vite + TypeScript)** 的小程序工程，UI 采用 **wot-design-uni**，原子化样式采用 **UnoCSS**。

本目录是一个**独立子项目**，与根目录的 Nuxt 工程互不影响：

- 根目录 `eslint.config.mjs` 已将 `mini` 加入 `ignores`，根项目 ESLint / vue-tsc 不会检查此目录。
- 本目录拥有独立的 `package.json` / `tsconfig.json` / `eslint.config.js`，需单独安装依赖与运行。

## 环境要求

- Node.js >= 20
- bun（与主项目一致）或 pnpm/npm 均可
- 微信开发者工具（用于运行 / 调试 `mp-weixin` 产物）

## 安装

```bash
cd mini
bun install
```

## 运行

```bash
# H5（浏览器调试）
bun run dev:h5

# 微信小程序（生成的产物在 dist/dev/mp-weixin，用微信开发者工具导入该目录）
bun run dev:mp-weixin

# 支付宝小程序
bun run dev:mp-alipay
```

## 构建

```bash
bun run build:h5          # 产物: dist/build/h5
bun run build:mp-weixin   # 产物: dist/build/mp-weixin
bun run build:mp-alipay   # 产物: dist/build/mp-alipay
```

## 检查

```bash
bun run type-check   # vue-tsc 类型检查
bun run lint         # ESLint（独立配置，不影响主项目）
```

## 目录结构

```
mini/
├── eslint.config.js        # 独立 ESLint flat config
├── index.html              # H5 入口
├── package.json
├── tsconfig.json
├── uno.config.ts           # UnoCSS 配置（小程序适配）
├── vite.config.ts          # Vite + @dcloudio/vite-plugin-uni
└── src/
    ├── App.vue
    ├── env.d.ts
    ├── main.ts
    ├── manifest.json       # uni-app 应用配置（appid 等）
    ├── pages.json          # 路由 / easycom / 全局样式
    ├── uni.scss
    └── pages/
        └── index/index.vue # 示例首页（wot-design-uni 按钮 + UnoCSS）
```

## 配置要点

- **easycom**：`pages.json` 已配置 `^wd-(.*)` 自动按需引入 wot-design-uni 组件，模板中直接使用 `<wd-button />` 等即可，无需手动 import。
- **appid**：`src/manifest.json` 中 `mp-weixin.appid` 为空，开发前请填入真实 AppID。
- **接口地址**：与主项目后端联调时，请在 `src/` 下封装请求并指向后端服务地址（H5 跨域与小程序合法域名需分别配置）。
