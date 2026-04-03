import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as bcrypt from 'bcrypt'

// 只在开发环境运行
if (process.env.NODE_ENV === 'production') {
  console.log('❌ 种子数据脚本不会在生产环境运行')
  process.exit(0)
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

const prisma = new PrismaClient({
  adapter,
})

// 示例文章内容
const samplePosts = [
  {
    title: '欢迎使用新的博客系统',
    content: `# 欢迎使用新的博客系统

这是一个基于 Nuxt 4 和 Prisma 构建的现代化博客系统。

## 主要特性

- 📝 响应式设计
- 🎨 使用 shadcn-nuxt 组件库
- 💾 PostgreSQL 数据库
- 🔐 完整的用户认证系统

希望你喜欢这个系统！`,
    desc: '欢迎来到我们的新博客，这里有一些你需要知道的事情。',
  },
  {
    title: 'TypeScript 最佳实践指南',
    content: `# TypeScript 最佳实践指南

TypeScript 为 JavaScript 添加了类型系统，让代码更加健壮。

## 1. 类型注解

\`\`\`typescript
interface User {
  id: number
  name: string
  email: string
}
\`\`\`

## 2. 使用泛型

泛型可以帮助我们创建可复用的组件。`,
    desc: '分享一些 TypeScript 开发中的最佳实践和技巧。',
  },
  {
    title: 'Vue 3 Composition API 详解',
    content: `# Vue 3 Composition API 详解

Vue 3 引入了 Composition API，让我们可以更好地组织代码逻辑。

## setup 函数

setup 函数是 Composition API 的入口点。

## ref 和 reactive

ref 和 reactive 是创建响应式数据的两种方式。`,
    desc: '深入理解 Vue 3 Composition API 的工作原理和使用方法。',
  },
  {
    title: 'Nuxt 4 新特性介绍',
    content: `# Nuxt 4 新特性介绍

Nuxt 4 带来了许多令人兴奋的新特性。

## 更快的构建速度

使用 Vite 作为默认构建工具，开发体验更佳。

## 更好的 TypeScript 支持

开箱即用的 TypeScript 支持，无需额外配置。`,
    desc: '探索 Nuxt 4 框架的最新功能和改进。',
  },
  {
    title: 'PostgreSQL 性能优化技巧',
    content: `# PostgreSQL 性能优化技巧

PostgreSQL 是一个强大的开源关系数据库。

## 索引优化

合理使用索引可以大幅提升查询性能。

## 查询优化

使用 EXPLAIN ANALYZE 分析查询计划。`,
    desc: '一些实用的 PostgreSQL 数据库优化建议。',
  },
  {
    title: '前端开发工具推荐',
    content: `# 前端开发工具推荐

工欲善其事，必先利其器。

## VS Code

强大的代码编辑器，配合各种插件效果更佳。

## Chrome DevTools

前端调试的必备工具。`,
    desc: '分享一些提高开发效率的工具和插件。',
  },
  {
    title: 'CSS Grid 布局完全指南',
    content: `# CSS Grid 布局完全指南

CSS Grid 是一个强大的二维布局系统。

## 基本概念

- Grid Container
- Grid Item
- Grid Line
- Grid Track

## 实战案例

通过实际案例学习 Grid 布局。`,
    desc: '从零开始学习 CSS Grid 网格布局。',
  },
  {
    title: 'RESTful API 设计规范',
    content: `# RESTful API 设计规范

良好的 API 设计是后端开发的基础。

## URL 设计

使用名词而非动词，使用复数形式。

## HTTP 方法

GET、POST、PUT、DELETE 的正确使用。`,
    desc: '如何设计优雅且易用的 RESTful API。',
  },
  {
    title: 'Git 工作流最佳实践',
    content: `# Git 工作流最佳实践

掌握 Git 是每个开发者的必备技能。

## 分支管理

- main: 主分支
- develop: 开发分支
- feature: 功能分支

## 提交信息

使用清晰的提交信息，遵循 Conventional Commits 规范。`,
    desc: '高效使用 Git 进行版本控制和团队协作。',
  },
  {
    title: 'Docker 容器化入门',
    content: `# Docker 容器化入门

Docker 让应用部署变得简单。

## Dockerfile

编写 Dockerfile 来定义应用镜像。

## Docker Compose

使用 Docker Compose 管理多容器应用。`,
    desc: '学习如何使用 Docker 容器化你的应用。',
  },
  {
    title: 'Web 性能优化实战',
    content: `# Web 性能优化实战

性能优化是前端开发的重要课题。

## 资源加载优化

- 代码分割
- 懒加载
- 预加载

## 渲染优化

- 减少 DOM 操作
- 使用虚拟滚动
- 防抖和节流`,
    desc: '提升网页加载速度和用户体验的实用技巧。',
  },
  {
    title: 'React Hooks 深入解析',
    content: `# React Hooks 深入解析

Hooks 改变了我们编写 React 组件的方式。

## useState

管理组件状态。

## useEffect

处理副作用。

## 自定义 Hooks

复用逻辑的最佳方式。`,
    desc: '深入理解 React Hooks 的工作原理和最佳实践。',
  },
  {
    title: 'Node.js 异步编程',
    content: `# Node.js 异步编程

Node.js 的异步特性是其核心优势。

## 回调函数

最基础的异步处理方式。

## Promise

Promise 让异步代码更易读。

## async/await

同步风格的异步代码写法。`,
    desc: '掌握 Node.js 中的异步编程模式。',
  },
  {
    title: 'Tailwind CSS 实战教程',
    content: `# Tailwind CSS 实战教程

Tailwind CSS 是一个实用优先的 CSS 框架。

## 基础概念

- 工具类
- 响应式设计
- 深色模式

## 自定义配置

通过 tailwind.config.js 自定义主题。`,
    desc: '从零开始学习 Tailwind CSS 框架。',
  },
  {
    title: '微前端架构实践',
    content: `# 微前端架构实践

微前端让大型应用开发更加灵活。

## qiankun

基于 single-spa 的微前端框架。

## 模块联邦

Webpack 5 的模块联邦功能。`,
    desc: '探讨微前端架构的设计理念和实现方案。',
  },
]

// 示例评论内容
const sampleComments = [
  '这篇文章写得真好，学到了很多！',
  '感谢分享，非常有用。',
  '有一个小问题，能详细解释一下吗？',
  '已经收藏了，以后慢慢看。',
  '期待下一篇更新！',
  '这个观点很新颖，值得深思。',
  '代码示例很清晰，感谢作者。',
  '请问有相关的学习资源推荐吗？',
  '博主回复好及时，点赞！',
  '这篇文章解决了我困扰很久的问题。',
  '写得非常详细，给新手很友好。',
  '希望多出一些这样的教程。',
  '已转发给同事，大家一起学习。',
  '博主太厉害了，向你学习！',
  '请问这个问题有其他解决方案吗？',
]

// 示例分类
const categories = [
  { name: '前端开发', desc: '关于 HTML、CSS、JavaScript 等前端技术的文章', class: 'frontend' },
  { name: '后端开发', desc: '服务器端开发相关的技术文章', class: 'backend' },
  { name: '数据库', desc: '数据库设计、优化和管理相关内容', class: 'database' },
  { name: '工具与效率', desc: '开发工具、效率提升技巧分享', class: 'tools' },
]

// 示例话题（额外分类）
const topics = [
  { name: 'Vue.js', desc: 'Vue.js 框架相关', class: 'vue' },
  { name: 'React', desc: 'React 框架相关', class: 'react' },
  { name: 'Node.js', desc: 'Node.js 后端开发', class: 'nodejs' },
  { name: 'TypeScript', desc: 'TypeScript 相关', class: 'typescript' },
  { name: '性能优化', desc: 'Web 性能优化', class: 'performance' },
  { name: 'DevOps', desc: '开发运维相关', class: 'devops' },
  { name: 'UI/UX', desc: '用户界面和体验设计', class: 'ui' },
  { name: '算法', desc: '算法与数据结构', class: 'algorithm' },
]

// 示例元数据
const metaItems = [
  { key: 'siteName', value: 'ImQi1' },
  { key: 'siteUrl', value: 'https://imqi1.com' },
  { key: 'siteDesc', value: '做技术的分享者、生活的摄影师、时事的评论员。' },
  { key: 'siteKeywords', value: '棋,ImQi1,棋的小站,生活,科技,编程,学习' },
  { key: 'siteIcp', value: '' },
  { key: 'commentEnabled', value: 'true' },
  { key: 'commentModeration', value: 'false' },
  { key: 'commentMarkdown', value: 'false' },
  { key: 'commentAvatarService', value: 'gravatar' },
  { key: 'commentPageSize', value: '10' },
  { key: 'commentMaxLevel', value: '4' },
  { key: 'commentRequireMail', value: 'true' },
  { key: 'commentRequireLink', value: 'false' },
  { key: 'commentInterval', value: '60' },
]

async function main() {
  console.log('🌱 开始生成种子数据...')

  // 清空现有数据
  console.log('🗑️  清空现有数据...')
  await prisma.comment.deleteMany()
  await prisma.postRelation.deleteMany()
  await prisma.post.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.meta.deleteMany()
  await prisma.subscribe.deleteMany()
  await prisma.changelog.deleteMany()
  await prisma.link.deleteMany()

  // 创建管理员用户
  console.log('👤 创建管理员用户...')
  const hashedPassword = await bcrypt.hash('123456', 10)
  const admin = await prisma.user.create({
    data: {
      name: 'admin',
      mail: 'admin@example.com',
      password: hashedPassword,
      role: 1,
    },
  })
  console.log(`   ✅ 用户: ${admin.name} / 123456`)

  // 创建分类和话题
  console.log('📁 创建分类和话题...')
  const allCategories = [...categories, ...topics]
  const createdCategories = await prisma.category.createMany({
    data: allCategories,
    skipDuplicates: true,
  })
  console.log(`   ✅ 创建了 ${allCategories.length} 个分类/话题`)

  // 获取分类ID
  const categoryRecords = await prisma.category.findMany()
  const categoryIds = categoryRecords.map(c => c.mid)

  // 创建文章
  console.log('📝 创建文章...')
  const posts = []
  for (let i = 0; i < samplePosts.length; i++) {
    const postData = samplePosts[i]
    const post = await prisma.post.create({
      data: {
        title: postData.title,
        desc: postData.desc,
        content: postData.content,
        status: 1, // 已发布
        comment_num: Math.floor(Math.random() * 10),
        show_toc: true,
        uid: admin.uid, // 设置文章作者
      },
    })
    posts.push(post)

    // 为每篇文章随机分配 2-4 个分类
    const numCategories = Math.floor(Math.random() * 3) + 2
    const shuffledCategories = [...categoryIds].sort(() => Math.random() - 0.5)
    for (let j = 0; j < numCategories; j++) {
      await prisma.postRelation.create({
        data: {
          cid: post.cid,
          mid: shuffledCategories[j],
        },
      })
    }
  }
  console.log(`   ✅ 创建了 ${posts.length} 篇文章`)

  // 创建评论
  console.log('💬 创建评论...')
  const commentCount = 30
  let createdComments = 0

  for (let i = 0; i < commentCount; i++) {
    const post = posts[Math.floor(Math.random() * posts.length)]
    const isReply = i > 5 && Math.random() > 0.6 // 40% 概率是回复
    const parentId = isReply ? Math.floor(Math.random() * i) + 1 : null

    await prisma.comment.create({
      data: {
        cid: post.cid,
        name: `用户${i + 1}`,
        mail: `user${i + 1}@example.com`,
        link: `https://example.com/user${i + 1}`,
        content: sampleComments[Math.floor(Math.random() * sampleComments.length)],
        status: 1,
        parent_id: parentId,
        agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
      },
    })
    createdComments++
  }
  console.log(`   ✅ 创建了 ${createdComments} 条评论`)

  // 创建元数据
  console.log('⚙️  创建元数据...')
  for (const item of metaItems) {
    await prisma.meta.upsert({
      where: { key: item.key },
      update: { value: item.value },
      create: item,
    })
  }
  console.log(`   ✅ 创建了 ${metaItems.length} 条元数据`)

  // 创建示例友情链接
  console.log('🔗 创建友情链接...')
  const links = [
    { name: 'Vue.js', desc: '渐进式 JavaScript 框架', link: 'https://vuejs.org', avatar: 'https://vuejs.org/logo.svg' },
    { name: 'Nuxt', desc: 'Vue.js 全栈框架', link: 'https://nuxt.com', avatar: 'https://nuxt.com/assets/design/test/logo-full.svg' },
    { name: 'Prisma', desc: '下一代 ORM', link: 'https://www.prisma.io', avatar: 'https://www.prisma.io/images/favicon.ico' },
    { name: 'Vite', desc: '下一代前端工具', link: 'https://vitejs.dev', avatar: 'https://vitejs.dev/logo.svg' },
  ]
  await prisma.link.createMany({
    data: links,
  })
  console.log(`   ✅ 创建了 ${links.length} 个友情链接`)

  // 创建示例订阅
  console.log('📰 创建订阅列表...')
  const subscribes = [
    { name: 'Vue Blog', url: 'https://blog.vuejs.org/feed.xml', avatar: 'https://vuejs.org/logo.svg' },
    { name: 'Nuxt Blog', url: 'https://nuxt.com/blog/feed.xml', avatar: 'https://nuxt.com/assets/design/test/logo-full.svg' },
  ]
  await prisma.subscribe.createMany({
    data: subscribes,
  })
  console.log(`   ✅ 创建了 ${subscribes.length} 个订阅`)

  // 创建更新日志
  console.log('📋 创建更新日志...')
  const changelogs = [
    { class: 'feature', desc: '添加用户管理功能' },
    { class: 'improvement', desc: '优化文章列表加载速度' },
    { class: 'fix', desc: '修复评论回复的显示问题' },
  ]
  await prisma.changelog.createMany({
    data: changelogs,
  })
  console.log(`   ✅ 创建了 ${changelogs.length} 条更新日志`)

  console.log('')
  console.log('✨ 种子数据生成完成！')
  console.log('')
  console.log('📊 数据统计：')
  console.log(`   - 用户: 1 (admin / 123456)`)
  console.log(`   - 文章: ${posts.length}`)
  console.log(`   - 评论: ${createdComments}`)
  console.log(`   - 分类: ${categories.length}`)
  console.log(`   - 话题: ${topics.length}`)
  console.log(`   - 元数据: ${metaItems.length}`)
  console.log(`   - 友情链接: ${links.length}`)
  console.log(`   - 订阅: ${subscribes.length}`)
  console.log(`   - 更新日志: ${changelogs.length}`)
  console.log('')
}

main()
  .catch((e) => {
    console.error('❌ 种子数据生成失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
