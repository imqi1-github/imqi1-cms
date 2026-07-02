import type { ArchiveMonthGroup } from '@/types/archive'

// 归档页写死数据 —— 仅用于 UI 预览，后续替换为真实接口
export const archiveGroups: ArchiveMonthGroup[] = [
  {
    title: '2026 年 07 月',
    items: [
      { id: 1, day: '02', title: '在小程序里补齐博客归档页' },
      { id: 2, day: '01', title: '把生活照片整理成一条时间线' },
    ],
  },
  {
    title: '2026 年 06 月',
    items: [
      { id: 3, day: '28', title: '给 Nuxt 博客做一次小范围体检' },
      { id: 4, day: '21', title: '雨天写代码时听的几张专辑' },
      { id: 5, day: '12', title: '用更少的状态管理首页滚动效果' },
    ],
  },
  {
    title: '2026 年 05 月',
    items: [
      { id: 6, day: '30', title: '端午前后的一些随手拍' },
      { id: 7, day: '18', title: '从附件元数据重构想到的细节' },
      { id: 8, day: '06', title: '小程序端 UI 的第一轮整理' },
    ],
  },
  {
    title: '2026 年 04 月',
    items: [
      { id: 9, day: '25', title: '把动画拆成更轻的滚动揭示指令' },
      { id: 10, day: '14', title: '一次关于数据库同步的排雷记录' },
    ],
  },
  {
    title: '2026 年 03 月',
    items: [
      { id: 11, day: '19', title: '春天的第一杯冰咖啡' },
      { id: 12, day: '03', title: '把旧主题迁到新的结构里' },
    ],
  },
]
