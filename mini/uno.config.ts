import { defineConfig } from 'unocss'

import { presetUni } from '@uni-helper/unocss-preset-uni'

// UnoCSS 配置（小程序适配）
// presetUni 内部已整合 presetUno / presetAttributify / 小程序转义等能力，
// 无需再手动注册 presetMini / presetAttributify。
export default defineConfig({
  presets: [
    presetUni(),
  ],
  // 小程序不支持 `:` `/` `[` 等字符，presetUni 已处理；如需自定义可在此扩展。
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
  },
})
