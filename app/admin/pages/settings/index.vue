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
          <NuxtLink to="/admin/links" class="block px-4 py-2 rounded hover:bg-accent">友情链接</NuxtLink>
          <NuxtLink to="/admin/settings" class="block px-4 py-2 rounded bg-accent">系统设置</NuxtLink>
        </nav>
      </aside>

      <main class="flex-1 p-8">
        <h2 class="text-2xl font-bold mb-6">系统设置</h2>

        <div class="space-y-6">
          <!-- 基本信息 -->
          <div class="bg-card border rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">基本信息</h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">网站名称</label>
                <input v-model="settings.siteName" type="text" class="w-full px-3 py-2 border rounded bg-background" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">网站描述</label>
                <input v-model="settings.siteDesc" type="text" class="w-full px-3 py-2 border rounded bg-background" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">网站关键词</label>
                <input v-model="settings.siteKeywords" type="text" class="w-full px-3 py-2 border rounded bg-background" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">备案号</label>
                <input v-model="settings.siteIcp" type="text" class="w-full px-3 py-2 border rounded bg-background" />
              </div>
            </div>
          </div>

          <!-- 评论设置 -->
          <div class="bg-card border rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">评论设置</h3>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">开启评论</div>
                  <div class="text-sm text-muted-foreground">是否允许用户发表评论</div>
                </div>
                <input v-model="settings.commentEnabled" type="checkbox" class="w-5 h-5" />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">评论审核</div>
                  <div class="text-sm text-muted-foreground">新评论需要审核后才能显示</div>
                </div>
                <input v-model="settings.commentModeration" type="checkbox" class="w-5 h-5" />
              </div>
            </div>
          </div>

          <!-- 订阅列表 -->
          <div class="bg-card border rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">订阅列表</h3>
            <div class="space-y-4">
              <div v-for="sub in subscribes" :key="sub.id" class="flex items-center gap-4 p-4 border rounded">
                <img v-if="sub.avatar" :src="sub.avatar" class="w-12 h-12 rounded" />
                <div class="flex-1">
                  <div class="font-medium">{{ sub.name }}</div>
                  <a :href="sub.url" target="_blank" class="text-sm text-primary hover:underline">{{ sub.url }}</a>
                </div>
                <button @click="deleteSubscribe(sub.id)" class="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-80">删除</button>
              </div>
              <div class="border-t pt-4">
                <h4 class="font-medium mb-3">添加订阅</h4>
                <div class="grid grid-cols-4 gap-4">
                  <input v-model="newSubscribe.name" type="text" placeholder="名称" class="px-3 py-2 border rounded bg-background" />
                  <input v-model="newSubscribe.url" type="url" placeholder="RSS URL" class="px-3 py-2 border rounded bg-background" />
                  <input v-model="newSubscribe.avatar" type="url" placeholder="头像 URL" class="px-3 py-2 border rounded bg-background" />
                  <button @click="addSubscribe" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">添加</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 更新日志 -->
          <div class="bg-card border rounded-lg p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-semibold">更新日志</h3>
              <button @click="showChangelogModal = true" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 text-sm">
                添加日志
              </button>
            </div>
            <div class="space-y-4">
              <div v-for="log in changelogs" :key="log.id" class="p-4 border rounded">
                <div class="flex justify-between items-start mb-2">
                  <span class="px-2 py-1 bg-secondary rounded text-sm">{{ log.class }}</span>
                  <span class="text-sm text-muted-foreground">{{ formatDate(log.create_time) }}</span>
                </div>
                <p class="text-foreground">{{ log.desc }}</p>
              </div>
            </div>
          </div>

          <!-- 保存按钮 -->
          <div class="flex justify-end">
            <button @click="saveSettings" class="px-6 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">
              保存设置
            </button>
          </div>
        </div>
      </main>
    </div>

    <!-- 添加更新日志弹窗 -->
    <div v-if="showChangelogModal" class="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div class="bg-card rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-bold mb-4">添加更新日志</h3>
        <form @submit.prevent="addChangelog">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">类型</label>
              <select v-model="newChangelog.class" class="w-full px-3 py-2 border rounded bg-background">
                <option value="feature">新功能</option>
                <option value="fix">修复</option>
                <option value="improvement">优化</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">描述</label>
              <textarea v-model="newChangelog.desc" required class="w-full px-3 py-2 border rounded bg-background" rows="4"></textarea>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button type="button" @click="showChangelogModal = false" class="px-4 py-2 bg-secondary rounded hover:bg-accent">取消</button>
            <button type="submit" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">确定</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { prisma } from '~/lib/prisma'

const settings = ref({
  siteName: '',
  siteDesc: '',
  siteKeywords: '',
  siteIcp: '',
  commentEnabled: true,
  commentModeration: false
})

const subscribes = ref<any[]>([])
const changelogs = ref<any[]>([])
const showChangelogModal = ref(false)

const newSubscribe = ref({ name: '', url: '', avatar: '' })
const newChangelog = ref({ class: 'feature', desc: '' })

// 加载设置
async function loadSettings() {
  const metas = await prisma.meta.findMany()

  metas.forEach((meta: any) => {
    if (meta.key === 'siteName') settings.value.siteName = meta.value
    if (meta.key === 'siteDesc') settings.value.siteDesc = meta.value
    if (meta.key === 'siteKeywords') settings.value.siteKeywords = meta.value
    if (meta.key === 'siteIcp') settings.value.siteIcp = meta.value
    if (meta.key === 'commentEnabled') settings.value.commentEnabled = meta.value === 'true'
    if (meta.key === 'commentModeration') settings.value.commentModeration = meta.value === 'true'
  })
}

// 保存设置
async function saveSettings() {
  const updates = [
    { key: 'siteName', value: settings.value.siteName },
    { key: 'siteDesc', value: settings.value.siteDesc },
    { key: 'siteKeywords', value: settings.value.siteKeywords },
    { key: 'siteIcp', value: settings.value.siteIcp },
    { key: 'commentEnabled', value: String(settings.value.commentEnabled) },
    { key: 'commentModeration', value: String(settings.value.commentModeration) }
  ]

  for (const update of updates) {
    await prisma.meta.upsert({
      where: { key: update.key },
      create: { key: update.key, value: update.value },
      update: { value: update.value }
    })
  }

  alert('设置已保存')
}

// 加载订阅列表
async function loadSubscribes() {
  subscribes.value = await prisma.subscribe.findMany()
}

async function addSubscribe() {
  await prisma.subscribe.create({
    data: {
      name: newSubscribe.value.name,
      url: newSubscribe.value.url,
      avatar: newSubscribe.value.avatar || null
    }
  })
  newSubscribe.value = { name: '', url: '', avatar: '' }
  await loadSubscribes()
}

async function deleteSubscribe(id: number) {
  if (confirm('确定要删除这个订阅吗？')) {
    await prisma.subscribe.delete({ where: { id } })
    await loadSubscribes()
  }
}

// 加载更新日志
async function loadChangelogs() {
  changelogs.value = await prisma.changelog.findMany({
    orderBy: { create_time: 'desc' }
  })
}

async function addChangelog() {
  await prisma.changelog.create({
    data: {
      class: newChangelog.value.class,
      desc: newChangelog.value.desc
    }
  })
  newChangelog.value = { class: 'feature', desc: '' }
  showChangelogModal.value = false
  await loadChangelogs()
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  loadSettings()
  loadSubscribes()
  loadChangelogs()
})
</script>
