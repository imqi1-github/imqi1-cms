<template>
  <div class="min-h-screen bg-background">
    <div class="flex">
      <!-- 侧边栏 -->
      <aside class="w-64 border-r bg-card min-h-screen p-4">
        <h1 class="text-xl font-bold mb-6">后台管理</h1>
        <nav class="space-y-2">
          <NuxtLink to="/admin" class="block px-4 py-2 rounded hover:bg-accent">
            仪表盘
          </NuxtLink>
          <NuxtLink to="/admin/posts" class="block px-4 py-2 rounded hover:bg-accent">
            文章管理
          </NuxtLink>
          <NuxtLink to="/admin/comments" class="block px-4 py-2 rounded hover:bg-accent">
            评论管理
          </NuxtLink>
          <NuxtLink to="/admin/categories" class="block px-4 py-2 rounded hover:bg-accent">
            分类管理
          </NuxtLink>
          <NuxtLink to="/admin/users" class="block px-4 py-2 rounded hover:bg-accent">
            用户管理
          </NuxtLink>
          <NuxtLink to="/admin/links" class="block px-4 py-2 rounded hover:bg-accent">
            友情链接
          </NuxtLink>
          <NuxtLink to="/admin/settings" class="block px-4 py-2 rounded hover:bg-accent">
            系统设置
          </NuxtLink>
        </nav>
      </aside>

      <!-- 主内容区 -->
      <main class="flex-1 p-8">
        <h2 class="text-2xl font-bold mb-6">仪表盘</h2>

        <!-- 统计卡片 -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div class="bg-card border rounded-lg p-6">
            <div class="text-sm text-muted-foreground">文章总数</div>
            <div class="text-2xl font-bold">{{ stats.posts }}</div>
          </div>
          <div class="bg-card border rounded-lg p-6">
            <div class="text-sm text-muted-foreground">评论总数</div>
            <div class="text-2xl font-bold">{{ stats.comments }}</div>
          </div>
          <div class="bg-card border rounded-lg p-6">
            <div class="text-sm text-muted-foreground">分类数量</div>
            <div class="text-2xl font-bold">{{ stats.categories }}</div>
          </div>
          <div class="bg-card border rounded-lg p-6">
            <div class="text-sm text-muted-foreground">用户数量</div>
            <div class="text-2xl font-bold">{{ stats.users }}</div>
          </div>
        </div>

        <!-- 最新文章 -->
        <div class="bg-card border rounded-lg p-6">
          <h3 class="text-lg font-semibold mb-4">最新文章</h3>
          <div v-if="recentPosts.length > 0" class="space-y-4">
            <div v-for="post in recentPosts" :key="post.cid" class="flex justify-between items-center py-2 border-b last:border-0">
              <div>
                <div class="font-medium">{{ post.title }}</div>
                <div class="text-sm text-muted-foreground">{{ formatDate(post.create_time) }}</div>
              </div>
              <div class="flex gap-2">
                <button class="px-3 py-1 text-sm bg-secondary rounded hover:bg-accent">编辑</button>
                <button class="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-80">删除</button>
              </div>
            </div>
          </div>
          <div v-else class="text-muted-foreground text-center py-8">
            暂无文章
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { prisma } from '~/lib/prisma'

// 获取统计数据
const stats = ref({
  posts: 0,
  comments: 0,
  categories: 0,
  users: 0
})

const recentPosts = ref<any[]>([])

onMounted(async () => {
  try {
    const [postsCount, commentsCount, categoriesCount, usersCount, posts] = await Promise.all([
      prisma.post.count(),
      prisma.comment.count(),
      prisma.category.count(),
      prisma.user.count(),
      prisma.post.findMany({
        take: 5,
        orderBy: { create_time: 'desc' }
      })
    ])

    stats.value = {
      posts: postsCount,
      comments: commentsCount,
      categories: categoriesCount,
      users: usersCount
    }

    recentPosts.value = posts
  } catch (error) {
    console.error('获取数据失败:', error)
  }
})

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('zh-CN')
}
</script>
