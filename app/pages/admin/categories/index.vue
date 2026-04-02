<template>
  <div class="min-h-screen bg-background">
    <div class="flex">
      <aside class="w-64 border-r bg-card min-h-screen p-4">
        <h1 class="text-xl font-bold mb-6">后台管理</h1>
        <nav class="space-y-2">
          <NuxtLink to="/admin" class="block px-4 py-2 rounded hover:bg-accent">仪表盘</NuxtLink>
          <NuxtLink to="/admin/posts" class="block px-4 py-2 rounded hover:bg-accent">文章管理</NuxtLink>
          <NuxtLink to="/admin/comments" class="block px-4 py-2 rounded hover:bg-accent">评论管理</NuxtLink>
          <NuxtLink to="/admin/categories" class="block px-4 py-2 rounded bg-accent">分类管理</NuxtLink>
          <NuxtLink to="/admin/users" class="block px-4 py-2 rounded hover:bg-accent">用户管理</NuxtLink>
          <NuxtLink to="/admin/links" class="block px-4 py-2 rounded hover:bg-accent">友情链接</NuxtLink>
          <NuxtLink to="/admin/settings" class="block px-4 py-2 rounded hover:bg-accent">系统设置</NuxtLink>
        </nav>
      </aside>

      <main class="flex-1 p-8">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">分类管理</h2>
          <button @click="showAddModal = true" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">
            新建分类
          </button>
        </div>

        <div class="bg-card border rounded-lg">
          <table class="w-full">
            <thead class="bg-muted">
              <tr>
                <th class="text-left p-4">名称</th>
                <th class="text-left p-4">描述</th>
                <th class="text-left p-4">类型</th>
                <th class="text-left p-4">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="category in categories" :key="category.mid" class="border-t">
                <td class="p-4 font-medium">{{ category.name }}</td>
                <td class="p-4 text-muted-foreground">{{ category.desc || '-' }}</td>
                <td class="p-4">
                  <span class="px-2 py-1 bg-secondary rounded text-sm">{{ category.class || '默认' }}</span>
                </td>
                <td class="p-4">
                  <div class="flex gap-2">
                    <button class="px-3 py-1 text-sm bg-secondary rounded hover:bg-accent">编辑</button>
                    <button @click="deleteCategory(category.mid)" class="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-80">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="categories.length === 0" class="text-center p-8 text-muted-foreground">
            暂无分类
          </div>
        </div>
      </main>
    </div>

    <!-- 添加分类弹窗 -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div class="bg-card rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-bold mb-4">新建分类</h3>
        <form @submit.prevent="addCategory">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">名称</label>
              <input v-model="newCategory.name" type="text" required class="w-full px-3 py-2 border rounded bg-background" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">描述</label>
              <textarea v-model="newCategory.desc" class="w-full px-3 py-2 border rounded bg-background" rows="3"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">类型</label>
              <input v-model="newCategory.class" type="text" class="w-full px-3 py-2 border rounded bg-background" />
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
const categories = ref<any[]>([])
const showAddModal = ref(false)
const newCategory = ref({ name: '', desc: '', class: '' })

async function fetchCategories() {
  categories.value = await $fetch('/api/admin/categories') as any[]
}

async function addCategory() {
  await $fetch('/api/admin/categories', {
    method: 'POST',
    body: newCategory.value
  })
  newCategory.value = { name: '', desc: '', class: '' }
  showAddModal.value = false
  await fetchCategories()
}

async function deleteCategory(mid: number) {
  if (confirm('确定要删除这个分类吗？')) {
    await $fetch(`/api/admin/categories/${mid}`, { method: 'DELETE' })
    await fetchCategories()
  }
}

onMounted(() => {
  fetchCategories()
})
</script>
