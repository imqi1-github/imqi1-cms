import { resolve } from 'node:path'

import UnoCSS from '@unocss/vite'
import uniPlugin from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'

// uni-app 小程序端 Vite 配置
// 文档: https://uniapp.dcloud.net.cn/quickstart-cli.html
// @dcloudio/vite-plugin-uni 为 CJS 包，部分加载链路下 ESM default 会整体返回
// module.exports 对象而非函数，这里做一次安全解包。
const uni = (uniPlugin as unknown as { default?: typeof uniPlugin }).default ?? uniPlugin

export default defineConfig({
  plugins: [
    UnoCSS(),
    uni(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
