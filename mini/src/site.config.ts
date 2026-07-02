import { defineSiteConfig } from '@/utils/site-config'

/**
 * 小程序站点静态配置实例。
 *
 * 在任何文件中 `import { siteConfig } from '@/site.config'` 即可使用。
 * 悬浮提示会展示各字段的 JSDoc 说明。
 */
export const siteConfig = defineSiteConfig({
  siteName: 'ImQi1',
  home: {
    eyebrow: 'BLOG',
    titleLines: ['记录代码，', '也记录生活。'],
    description: '技术笔记、城市漫步、随手拍，偶尔写点没用的东西。',
    primaryButton: {
      label: '浏览文章',
    },
    secondaryButton: {
      label: '关于',
    },
  },
})
