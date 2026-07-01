import type { AboutInfo } from '@/types/about'

// 关于页写死数据 —— 仅用于 UI 预览，后续替换为真实接口
export const blogInfo: AboutInfo[] = [
  { label: '站点名称', value: 'ImQi1', icon: 'app' },
  { label: '作者', value: '棋', icon: 'user' },
  { label: '小程序版本', value: '1.1.4', icon: 'notification' },
  { label: '网站地址', value: 'imqi1.com', icon: 'link', action: 'copy' },
]

export const contactInfo: AboutInfo[] = [
  { label: '邮箱', value: 'imqi1@qq.com', icon: 'mail', action: 'copy' },
]

// 小程序技术栈（取自 package.json）
export const techStack: string[] = [
  'uni-app',
  'Vue 3',
  'wot-design-uni',
  'UnoCSS',
  'TypeScript',
  'Vite',
  'Sass',
]

export const copyright = '2026 ©️ 棋'
