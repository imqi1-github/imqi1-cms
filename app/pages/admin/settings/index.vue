<script setup lang="ts">
const settings = ref({
  siteName: '',
  siteDesc: '',
  siteKeywords: '',
  siteIcp: '',
  commentEnabled: true,
  commentModeration: false,
})

const subscribes = ref<any[]>([])
const changelogs = ref<any[]>([])
const showChangelogModal = ref(false)

const newSubscribe = ref({ name: '', url: '', avatar: '' })
const newChangelog = ref({ class: 'feature', desc: '' })

// 加载设置
async function loadSettings() {
  try {
    settings.value = await $fetch('/api/admin/settings') as any
  } catch (error) {
    console.error('获取设置失败:', error)
  }
}

// 保存设置
async function saveSettings() {
  try {
    await $fetch('/api/admin/settings', {
      method: 'POST',
      body: settings.value,
    })
    // TODO: 使用 shadcn 的 Toast 组件替代 alert
    alert('设置已保存')
  } catch (error) {
    console.error('保存失败:', error)
  }
}

// 加载订阅列表
async function loadSubscribes() {
  try {
    subscribes.value = await $fetch('/api/admin/subscribes') as any[]
  } catch (error) {
    console.error('获取订阅失败:', error)
    subscribes.value = []
  }
}

async function addSubscribe() {
  try {
    await $fetch('/api/admin/subscribes', {
      method: 'POST',
      body: newSubscribe.value,
    })
    newSubscribe.value = { name: '', url: '', avatar: '' }
    await loadSubscribes()
  } catch (error) {
    console.error('添加失败:', error)
  }
}

async function deleteSubscribe(id: number) {
  const confirmed = confirm('确定要删除这个订阅吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/subscribes/${id}`, { method: 'DELETE' })
      await loadSubscribes()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

// 加载更新日志
async function loadChangelogs() {
  try {
    changelogs.value = await $fetch('/api/admin/changelogs') as any[]
  } catch (error) {
    console.error('获取更新日志失败:', error)
    changelogs.value = []
  }
}

async function addChangelog() {
  try {
    await $fetch('/api/admin/changelogs', {
      method: 'POST',
      body: newChangelog.value,
    })
    newChangelog.value = { class: 'feature', desc: '' }
    showChangelogModal.value = false
    await loadChangelogs()
  } catch (error) {
    console.error('添加失败:', error)
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  loadSettings()
  loadSubscribes()
  loadChangelogs()
})
</script>

<template>
  <AdminLayout>
    <div class="mb-6">
      <h2 class="text-2xl font-bold">系统设置</h2>
      <p class="text-sm text-muted-foreground mt-1">管理系统配置和参数</p>
    </div>

    <div class="space-y-6">
      <!-- 基本信息 -->
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>配置网站的基本信息</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="siteName">网站名称</Label>
              <Input id="siteName" v-model="settings.siteName" placeholder="我的网站" />
            </div>
            <div class="space-y-2">
              <Label for="siteDesc">网站描述</Label>
              <Input id="siteDesc" v-model="settings.siteDesc" placeholder="网站描述" />
            </div>
            <div class="space-y-2">
              <Label for="siteKeywords">网站关键词</Label>
              <Input id="siteKeywords" v-model="settings.siteKeywords" placeholder="关键词" />
            </div>
            <div class="space-y-2">
              <Label for="siteIcp">备案号</Label>
              <Input id="siteIcp" v-model="settings.siteIcp" placeholder="备案号" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 评论设置 -->
      <Card>
        <CardHeader>
          <CardTitle>评论设置</CardTitle>
          <CardDescription>配置评论功能</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label for="commentEnabled">开启评论</Label>
              <p class="text-sm text-muted-foreground">是否允许用户发表评论</p>
            </div>
            <Switch id="commentEnabled" v-model:checked="settings.commentEnabled" />
          </div>
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label for="commentModeration">评论审核</Label>
              <p class="text-sm text-muted-foreground">新评论需要审核后才能显示</p>
            </div>
            <Switch id="commentModeration" v-model:checked="settings.commentModeration" />
          </div>
        </CardContent>
      </Card>

      <!-- 订阅列表 -->
      <Card>
        <CardHeader>
          <CardTitle>订阅列表</CardTitle>
          <CardDescription>管理 RSS 订阅源</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div v-for="sub in subscribes" :key="sub.id" class="flex items-center gap-4 p-4 border rounded-lg">
              <Avatar class="size-12">
                <AvatarImage v-if="sub.avatar" :src="sub.avatar" />
                <AvatarFallback>{{ sub.name?.charAt(0) || '?' }}</AvatarFallback>
              </Avatar>
              <div class="flex-1 min-w-0">
                <p class="font-medium">{{ sub.name }}</p>
                <a :href="sub.url" target="_blank" class="text-sm text-primary hover:underline truncate block">
                  {{ sub.url }}
                </a>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 text-destructive hover:text-destructive"
                @click="deleteSubscribe(sub.id)"
              >
                <Icon name="lucide:trash-2" class="size-4" />
              </Button>
            </div>
            <Separator />
            <div>
              <h4 class="font-medium mb-3">添加订阅</h4>
              <form @submit.prevent="addSubscribe" class="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input v-model="newSubscribe.name" placeholder="名称" required />
                <Input v-model="newSubscribe.url" type="url" placeholder="RSS URL" required />
                <Input v-model="newSubscribe.avatar" type="url" placeholder="头像 URL" />
                <Button type="submit">添加</Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 更新日志 -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>更新日志</CardTitle>
              <CardDescription>记录系统更新历史</CardDescription>
            </div>
            <Button variant="outline" size="sm" @click="showChangelogModal = true">
              <Icon name="lucide:plus" class="mr-2 size-4" />
              添加日志
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div v-for="log in changelogs" :key="log.id" class="p-4 border rounded-lg">
              <div class="flex justify-between items-start mb-2">
                <Badge variant="outline">{{ log.class }}</Badge>
                <span class="text-sm text-muted-foreground">{{ formatDate(log.create_time) }}</span>
              </div>
              <p class="text-foreground">{{ log.desc }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 保存按钮 -->
      <div class="flex justify-end">
        <Button size="lg" @click="saveSettings">
          <Icon name="lucide:save" class="mr-2 size-4" />
          保存设置
        </Button>
      </div>
    </div>

    <!-- 添加更新日志弹窗 -->
    <Dialog v-model:open="showChangelogModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加更新日志</DialogTitle>
          <DialogDescription>记录一次系统更新</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addChangelog">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="logClass">类型</Label>
              <Select v-model="newChangelog.class">
                <SelectTrigger id="logClass">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">新功能</SelectItem>
                  <SelectItem value="fix">修复</SelectItem>
                  <SelectItem value="improvement">优化</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="logDesc">描述</Label>
              <Textarea id="logDesc" v-model="newChangelog.desc" placeholder="更新内容描述" rows="4" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showChangelogModal = false">
              取消
            </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
