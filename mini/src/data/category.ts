import type { CategoryItem } from '@/types/category'

// 分类页写死数据 —— 仅用于 UI 预览，后续替换为真实接口
export const categories: CategoryItem[] = [
  {
    id: 1,
    title: '技术笔记',
    description: 'Nuxt、Vue、小程序与工程化记录',
    count: 18,
    mark: 'Tech',
  },
  {
    id: 2,
    title: '生活碎片',
    description: '日常、咖啡、音乐和没用的东西',
    count: 12,
    mark: 'Life',
  },
  {
    id: 3,
    title: '城市漫步',
    description: '走走停停，记录街道和天气',
    count: 9,
    mark: 'Walk',
  },
  {
    id: 4,
    title: '摄影随笔',
    description: '随手拍、小物件与照片整理',
    count: 7,
    mark: 'Photo',
  },
]
