<template>
  <div class="min-h-screen bg-background">
    <div class="flex">
      <aside class="w-64 border-r bg-card min-h-screen p-4">
        <h1 class="text-xl font-bold mb-6">后台管理</h1>
        <nav class="space-y-2">
          <NuxtLink to="/admin" class="block px-4 py-2 rounded hover:bg-accent">仪表盘</NuxtLink>
          <NuxtLink to="/admin/posts" class="block px-4 py-2 rounded hover:bg-accent">文章管理</NuxtLink>
          <NuxtLink to="/admin/comments" class="block px-4 py-2 rounded hover:bg-accent">评论管理</NuxtLink>
          <NuxtLink to="/admin/categories" class="block px-4 py-2 rounded hover:bg-accent">分类管理</NuxtLink>
          <NuxtLink to="/admin/users" class="block px-4 py-2 rounded hover:bg-accent">用户管理</NuxtLink>
          <NuxtLink to="/admin/links" class="block px-4 py-2 rounded bg-accent">友情链接</NuxtLink>
          <NuxtLink to="/admin/settings" class="block px-4 py-2 rounded hover:bg-accent">系统设置</NuxtLink>
        </nav>
      </aside>

      <main class="flex-1 p-8">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">友情链接</h2>
          <button @click="showAddModal = true" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">
            添加链接
          </button>
        </div>

        <div class="bg-card border rounded-lg">
          <table class="w-full">
            <thead class="bg-muted">
              <tr>
                <th class="text-left p-4">名称</th>
                <th class="text-left p-4">链接</th>
                <th class="text-left p-4">描述</th>
                <th class="text-left p-4">状态</th>
                <th class="text-left p-4">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="link in links" :key="link.id" class="border-t">
                <td class="p-4">
                  <div class="flex items-center gap-3">
                    <img v-if="link.avatar" :src="link.avatar" class="w-8 h-8 rounded" />
                    <span class="font-medium">{{ link.name }}</span>
                  </div>
                </td>
                <td class="p-4">
                  <a :href="link.link" target="_blank" class="text-primary hover:underline">{{ link.link }}</a>
                </td>
                <td class="p-4 text-muted-foreground">{{ link.desc || '-' }}</td>
                <td class="p-4">
                  <span :class="{
                    'px-2 py-1 rounded text-sm': true,
                    'bg-green-100 text-green-800': link.enabled,
                    'bg-gray-100 text-gray-800': !link.enabled
                  }">
                    {{ link.enabled ? '启用' : '禁用' }}
                  </span>
                </td>
                <td class="p-4">
                  <div class="flex gap-2">
                    <button @click="toggleEnabled(link)" class="px-3 py-1 text-sm bg-secondary rounded hover:bg-accent">
                      {{ link.enabled ? '禁用' : '启用' }}
                    </button>
                    <button class="px-3 py-1 text-sm bg-secondary rounded hover:bg-accent">编辑</button>
                    <button @click="deleteLink(link.id)" class="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-80">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="links.length === 0" class="text-center p-8 text-muted-foreground">
            暂无友情链接
          </div>
        </div>
      </main>
    </div>

    <!-- 添加链接弹窗 -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div class="bg-card rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-bold mb-4">添加友情链接</h3>
        <form @submit.prevent="addLink">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">名称</label>
              <input v-model="newLink.name" type="text" required class="w-full px-3 py-2 border rounded bg-background" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">链接</label>
              <input v-model="newLink.link" type="url" required class="w-full px-3 py-2 border rounded bg-background" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">描述</label>
              <input v-model="newLink.desc" type="text" class="w-full px-3 py-2 border rounded bg-background" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">头像 URL</label>
              <input v-model="newLink.avatar" type="url" class="w-full px-3 py-2 border rounded bg-background" />
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button type="button" @click="showAddModal = false" class="px-4 py-2 bg-secondary rounded hover:bg-accent">取消</button>
            <button type="submit" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">确定</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const links = ref<any[]>([])
const showAddModal = ref(false)
const newLink = ref({ name: '', link: '', desc: '', avatar: '' })

async function fetchLinks() {
  links.value = await $fetch('/api/admin/links') as any[]
}

async function addLink() {
  await $fetch('/api/admin/links', {
    method: 'POST',
    body: newLink.value
  })
  newLink.value = { name: '', link: '', desc: '', avatar: '' }
  showAddModal.value = false
  await fetchLinks()
}

async function toggleEnabled(link: any) {
  await $fetch(`/api/admin/links/${link.id}/toggle`, { method: 'PATCH' })
  await fetchLinks()
}

async function deleteLink(id: number) {
  if (confirm('确定要删除这个链接吗？')) {
    await $fetch(`/api/admin/links/${id}`, { method: 'DELETE' })
    await fetchLinks()
  }
}

onMounted(() => {
  fetchLinks()
})
</script>
