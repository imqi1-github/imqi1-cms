<template>
  <div class="min-h-screen bg-background">
    <div class="flex">
      <aside class="w-64 border-r bg-card min-h-screen p-4">
        <h1 class="text-xl font-bold mb-6">后台管理</h1>
        <nav class="space-y-2">
          <NuxtLink to="/admin" class="block px-4 py-2 rounded hover:bg-accent">仪表盘</NuxtLink>
          <NuxtLink to="/admin/posts" class="block px-4 py-2 rounded hover:bg-accent">文章管理</NuxtLink>
          <NuxtLink to="/admin/comments" class="block px-4 py-2 rounded bg-accent">评论管理</NuxtLink>
          <NuxtLink to="/admin/categories" class="block px-4 py-2 rounded hover:bg-accent">分类管理</NuxtLink>
          <NuxtLink to="/admin/users" class="block px-4 py-2 rounded hover:bg-accent">用户管理</NuxtLink>
          <NuxtLink to="/admin/links" class="block px-4 py-2 rounded hover:bg-accent">友情链接</NuxtLink>
          <NuxtLink to="/admin/settings" class="block px-4 py-2 rounded hover:bg-accent">系统设置</NuxtLink>
        </nav>
      </aside>

      <main class="flex-1 p-8">
        <h2 class="text-2xl font-bold mb-6">评论管理</h2>

        <div class="bg-card border rounded-lg">
          <table class="w-full">
            <thead class="bg-muted">
              <tr>
                <th class="text-left p-4">评论者</th>
                <th class="text-left p-4">内容</th>
                <th class="text-left p-4">文章</th>
                <th class="text-left p-4">状态</th>
                <th class="text-left p-4">时间</th>
                <th class="text-left p-4">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="comment in comments" :key="comment.coid" class="border-t">
                <td class="p-4">
                  <div class="font-medium">{{ comment.name }}</div>
                  <div class="text-sm text-muted-foreground">{{ comment.mail }}</div>
                </td>
                <td class="p-4 max-w-md truncate">{{ comment.content }}</td>
                <td class="p-4">{{ getPostTitle(comment.cid) }}</td>
                <td class="p-4">
                  <span :class="{
                    'px-2 py-1 rounded text-sm': true,
                    'bg-green-100 text-green-800': comment.status === 1,
                    'bg-yellow-100 text-yellow-800': comment.status === 0
                  }">
                    {{ comment.status === 1 ? '已审核' : '待审核' }}
                  </span>
                </td>
                <td class="p-4">{{ formatDate(comment.create_time) }}</td>
                <td class="p-4">
                  <div class="flex gap-2">
                    <button @click="approveComment(comment.coid)" class="px-3 py-1 text-sm bg-secondary rounded hover:bg-accent">通过</button>
                    <button @click="deleteComment(comment.coid)" class="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-80">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="comments.length === 0" class="text-center p-8 text-muted-foreground">
            暂无评论
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { prisma } from '~/lib/prisma'

const comments = ref<any[]>([])
const postsMap = ref<Map<number, string>>(new Map())

async function fetchComments() {
  comments.value = await prisma.comment.findMany({
    orderBy: { create_time: 'desc' }
  })

  // 获取文章标题映射
  const posts = await prisma.post.findMany({
    select: { cid: true, title: true }
  })
  postsMap.value = new Map(posts.map(p => [p.cid, p.title]))
}

async function approveComment(coid: number) {
  await prisma.comment.update({
    where: { coid },
    data: { status: 1 }
  })
  await fetchComments()
}

async function deleteComment(coid: number) {
  if (confirm('确定要删除这条评论吗？')) {
    await prisma.comment.delete({ where: { coid } })
    await fetchComments()
  }
}

function getPostTitle(cid: number) {
  return postsMap.value.get(cid) || '未知'
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  fetchComments()
})
</script>
