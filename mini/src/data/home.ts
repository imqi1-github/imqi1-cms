import type { HeroStat, Photo, Post, QuickEntry } from '@/types/post'

// 首页写死数据 —— 仅用于 UI 预览，后续替换为真实接口
// 封面走 picsum 占位图（dev 工具已关 urlCheck，模拟器可加载）

export const heroStats: HeroStat[] = [
  { label: '文章', value: '128' },
  { label: '图片', value: '642' },
  { label: '建站', value: '3 年' },
]

export const quickEntries: QuickEntry[] = [
  { label: '归档', icon: 'layers' },
  { label: '分类', icon: 'folder' },
  { label: '友链', icon: 'link' },
  { label: '订阅', icon: 'subscribe' },
  { label: '关于', icon: 'user' },
]

export const recentPosts: Post[] = [
  {
    cid: 1,
    title: '用 Nuxt 4 重构博客主题 Glass',
    desc: '从主题选型到前后端同构，记录这一版主题的架构取舍与踩坑。',
    cover: 'https://picsum.photos/seed/imqi1-nuxt/600/400',
    category: { name: '技术', slug: 'code' },
    tags: ['Nuxt', 'TypeScript'],
    created: '3 天前',
    commentsNum: 12,
  },
  {
    cid: 2,
    title: '沈阳漫步：老城区的两万步',
    desc: '深秋的沈阳老城，从一条巷子走进另一条巷子。',
    cover: 'https://picsum.photos/seed/imqi1-shenyang/600/400',
    category: { name: '旅行', slug: 'travel' },
    tags: ['沈阳', '城市漫步'],
    created: '1 周前',
    commentsNum: 5,
    travelCount: 7,
  },
  {
    cid: 3,
    title: '实况照片在小程序里的落地',
    desc: '把 Live Photo 的前几帧塞进一张静态封面，是个有意思的取舍。',
    cover: 'https://picsum.photos/seed/imqi1-livephoto/600/400',
    category: { name: '技术', slug: 'code' },
    tags: ['实况照片', '小程序'],
    created: '2 周前',
    commentsNum: 8,
  },
  {
    cid: 4,
    title: '周末拍了些小物件',
    desc: '桌面上的键盘、咖啡杯和一本翻开的旧书。',
    cover: 'https://picsum.photos/seed/imqi1-objects/600/400',
    category: { name: '摄影', slug: 'shot' },
    tags: ['静物', '微距'],
    created: '3 周前',
    commentsNum: 3,
  },
]

export const recentPhotos: Photo[] = [
  { id: 1, url: 'https://picsum.photos/seed/imqi1-p1/400/400', desc: '老巷' },
  { id: 2, url: 'https://picsum.photos/seed/imqi1-p2/400/400', desc: '键盘' },
  { id: 3, url: 'https://picsum.photos/seed/imqi1-p3/400/400', desc: '日落' },
  { id: 4, url: 'https://picsum.photos/seed/imqi1-p4/400/400', desc: '咖啡' },
  { id: 5, url: 'https://picsum.photos/seed/imqi1-p5/400/400', desc: '书页' },
  { id: 6, url: 'https://picsum.photos/seed/imqi1-p6/400/400', desc: '路标' },
]
