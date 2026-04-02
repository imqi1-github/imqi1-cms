<template>
  <div class="min-h-screen bg-background">
    <div class="flex">
      <!-- 侧边栏 -->
      <aside class="w-64 border-r bg-card min-h-screen p-4">
        <h1 class="text-xl font-bold mb-6">后台管理</h1>
        <nav class="space-y-2">
          <NuxtLink to="/admin" class="block px-4 py-2 rounded hover:bg-accent">仪表盘</NuxtLink>
          <NuxtLink to="/admin/posts" class="block px-4 py-2 rounded bg-accent">文章管理</NuxtLink>
          <NuxtLink to="/admin/comments" class="block px-4 py-2 rounded hover:bg-accent">评论管理</NuxtLink>
          <NuxtLink to="/admin/categories" class="block px-4 py-2 rounded hover:bg-accent">分类管理</NuxtLink>
          <NuxtLink to="/admin/users" class="block px-4 py-2 rounded hover:bg-accent">用户管理</NuxtLink>
          <NuxtLink to="/admin/links" class="block px-4 py-2 rounded hover:bg-accent">友情链接</NuxtLink>
          <NuxtLink to="/admin/settings" class="block px-4 py-2 rounded hover:bg-accent">系统设置</NuxtLink>
        </nav>
      </aside>

      <!-- 主内容区 -->
      <main class="flex-1 p-8">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">文章管理</h2>
          <button class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">
            新建文章
          </button>
        </div>

        <!-- 文章列表 -->
        <div class="bg-card border rounded-lg">
          <table class="w-full">
            <thead class="bg-muted">
              <tr>
                <th class="text-left p-4">标题</th>
                <th class="text-left p-4">状态</th>
                <th class="text-left p-4">评论数</th>
                <th class="text-left p-4">创建时间</th>
                <th class="text-left p-4">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="post in posts" :key="post.cid" class="border-t">
                <td class="p-4">{{ post.title }}</td>
                <td class="p-4">
                  <span :class="{
                    'px-2 py-1 rounded text-sm': true,
                    'bg-green-100 text-green-800': post.status === 1,
                    'bg-yellow-100 text-yellow-800': post.status === 0
                  }">
                    {{ post.status === 1 ? '已发布' : '草稿' }}
                  </span>
                </td>
                <td class="p-4">{{ post.comment_num }}</td>
                <td class="p-4">{{ formatDate(post.create_time) }}</td>
                <td class="p-4">
                  <div class="flex gap-2">
                    <button class="px-3 py-1 text-sm bg-secondary rounded hover:bg-accent">编辑</button>
                    <button @click="deletePost(post.cid)" class="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-80">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="posts.length === 0" class="text-center p-8 text-muted-foreground">
            暂无文章
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { prisma } from '~/lib/prisma'

const posts = ref<any[]>([])

async function fetchPosts() {
  posts.value = await prisma.post.findMany({
    orderBy: { create_time: 'desc' }
  })
}

async function deletePost(cid: number) {
  if (confirm('确定要删除这篇文章吗？')) {
    await prisma.post.delete({ where: { cid } })
    await fetchPosts()
  }
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  fetchPosts()
})
</script>
