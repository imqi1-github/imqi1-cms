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
          <NuxtLink to="/admin/users" class="block px-4 py-2 rounded bg-accent">用户管理</NuxtLink>
          <NuxtLink to="/admin/links" class="block px-4 py-2 rounded hover:bg-accent">友情链接</NuxtLink>
          <NuxtLink to="/admin/settings" class="block px-4 py-2 rounded hover:bg-accent">系统设置</NuxtLink>
        </nav>
      </aside>

      <main class="flex-1 p-8">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">用户管理</h2>
          <button @click="showAddModal = true" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">
            新建用户
          </button>
        </div>

        <div class="bg-card border rounded-lg">
          <table class="w-full">
            <thead class="bg-muted">
              <tr>
                <th class="text-left p-4">用户名</th>
                <th class="text-left p-4">邮箱</th>
                <th class="text-left p-4">角色</th>
                <th class="text-left p-4">创建时间</th>
                <th class="text-left p-4">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id" class="border-t">
                <td class="p-4">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      {{ user.name.charAt(0).toUpperCase() }}
                    </div>
                    <span class="font-medium">{{ user.name }}</span>
                  </div>
                </td>
                <td class="p-4">{{ user.mail }}</td>
                <td class="p-4">
                  <span :class="{
                    'px-2 py-1 rounded text-sm': true,
                    'bg-purple-100 text-purple-800': user.role === 1,
                    'bg-gray-100 text-gray-800': user.role === 0
                  }">
                    {{ user.role === 1 ? '管理员' : '普通用户' }}
                  </span>
                </td>
                <td class="p-4">{{ formatDate(user.create) }}</td>
                <td class="p-4">
                  <div class="flex gap-2">
                    <button class="px-3 py-1 text-sm bg-secondary rounded hover:bg-accent">编辑</button>
                    <button @click="deleteUser(user.id)" class="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-80">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="users.length === 0" class="text-center p-8 text-muted-foreground">
            暂无用户
          </div>
        </div>
      </main>
    </div>

    <!-- 添加用户弹窗 -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div class="bg-card rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-bold mb-4">新建用户</h3>
        <form @submit.prevent="addUser">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">用户名</label>
              <input v-model="newUser.name" type="text" required class="w-full px-3 py-2 border rounded bg-background" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">邮箱</label>
              <input v-model="newUser.mail" type="email" required class="w-full px-3 py-2 border rounded bg-background" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">密码</label>
              <input v-model="newUser.password" type="password" required class="w-full px-3 py-2 border rounded bg-background" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">角色</label>
              <select v-model="newUser.role" class="w-full px-3 py-2 border rounded bg-background">
                <option :value="0">普通用户</option>
                <option :value="1">管理员</option>
              </select>
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
import { prisma } from '~/lib/prisma'

const users = ref<any[]>([])
const showAddModal = ref(false)
const newUser = ref({ name: '', mail: '', password: '', role: 0 })

async function fetchUsers() {
  users.value = await prisma.user.findMany()
}

async function addUser() {
  // 注意：实际项目中应该对密码进行哈希处理
  await prisma.user.create({
    data: {
      name: newUser.value.name,
      mail: newUser.value.mail,
      password: newUser.value.password, // TODO: 使用 bcrypt 等库进行哈希
      role: newUser.value.role
    }
  })
  newUser.value = { name: '', mail: '', password: '', role: 0 }
  showAddModal.value = false
  await fetchUsers()
}

async function deleteUser(id: number) {
  if (confirm('确定要删除这个用户吗？')) {
    await prisma.user.delete({ where: { id } })
    await fetchUsers()
  }
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  fetchUsers()
})
</script>
