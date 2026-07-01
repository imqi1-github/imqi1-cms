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
  // wot-design-uni 内部仍用 @import / 全局内置函数等 Sass 旧语法，Dart Sass 2.0+ 下会刷大量
  // 弃用警告（legacy-js-api / import / global-builtin）。这些警告无法在源码侧修复（第三方库）。
  //
  // 关键点：uni-app 的 SFC 样式经 @vue/compiler-sfc@3.4 的 compileStyle 走 legacy renderSync
  // 编译（因此出现 legacy-js-api），而 legacy API 忽略 quietDeps / silenceDeprecations
  // （二者为 modern 专属）。唯一对 legacy + modern 两条路径都生效的是 logger。
  // 故用 logger 统一吞掉 deprecation 类警告，real error 仍放行；再叠加 silenceDeprecations
  // 兜底 modern 路径。quietDeps 对相对 @import 不生效，仅留作 loadPath 依赖的兜底。
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions'],
        // logger 对 legacy renderSync 与 modern compileString 均生效：
        // legacy 形参 { deprecation: true }，modern 形参 { deprecation: '<id>' }。
        logger: {
          warn(message, options) {
            if (options && (options.deprecation || options.deprecationType))
              return
            console.warn(message)
          },
          debug() {},
        },
      },
    },
  },
})
