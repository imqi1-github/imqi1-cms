import type { ArticleCard } from '@/types/post'

// 首页写死数据 —— 仅用于 UI 预览，后续替换为真实接口
// 封面走根目录 `bun run serve` 启动的本地文件服务器：
//   .attachments/<path> → http://localhost:3030/<path>
// dev 工具已关 urlCheck，模拟器 / H5 均可加载
const FILE_SERVER = 'http://localhost:3030'

export const articles: ArticleCard[] = [
  {
    id: 1,
    title: '用 Nuxt 重构博客主题 ImQi1',
    cover: `${FILE_SERVER}/2024/02/113065190.webp`,
    publishedAt: '3 天前',
  },
  {
    id: 2,
    title: '沈阳漫步：老城区的两万步',
    cover: `${FILE_SERVER}/2024/05/1414882037.webp`,
    publishedAt: '1 周前',
  },
  {
    id: 3,
    title: '实况照片在小程序里的落地',
    cover: `${FILE_SERVER}/2024/08/1082892378.webp`,
    publishedAt: '2 周前',
  },
  {
    id: 4,
    title: '周末拍了些小物件',
    cover: `${FILE_SERVER}/2025/02/165424742.webp`,
    publishedAt: '1 个月前',
  },
  {
    id: 5,
    title: '把 Prisma 迁移写成幂等脚本',
    cover: `${FILE_SERVER}/2025/06/1600622921.webp`,
    publishedAt: '3 个月前',
  },
  {
    id: 6,
    title: '咖啡与代码的日常',
    cover: `${FILE_SERVER}/2026/03/1171177953.webp`,
    publishedAt: '半年前',
  },
]
