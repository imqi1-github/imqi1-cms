<script setup lang="ts">
const subscribes = ref<any[]>([])
const loading = ref(false)
const showAddForm = ref(false)

const newSubscribe = ref({ name: '', url: '', avatar: '' })

// 加载订阅列表
async function loadSubscribes() {
  loading.value = true
  try {
    subscribes.value = await $fetch('/api/admin/subscribes') as any[]
  } catch (error) {
    console.error('获取订阅失败:', error)
    subscribes.value = []
  } finally {
    loading.value = false
  }
}

async function addSubscribe() {
  try {
    await $fetch('/api/admin/subscribes', {
      method: 'POST',
      body: newSubscribe.value,
    })
    newSubscribe.value = { name: '', url: '', avatar: '' }
    showAddForm.value = false
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

function cancelAdd() {
  newSubscribe.value = { name: '', url: '', avatar: '' }
  showAddForm.value = false
}

onMounted(() => {
  loadSubscribes()
})
</script>

<template>
  <AdminLayout>
    <div class="mb-6">
      <h2 class="text-2xl font-bold">订阅列表</h2>
      <p class="text-sm text-muted-foreground mt-1">管理 RSS 订阅源</p>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>订阅源</CardTitle>
            <CardDescription>管理和配置 RSS 订阅源</CardDescription>
          </div>
          <Button @click="showAddForm = true">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            添加订阅
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <!-- 添加表单 -->
        <div v-if="showAddForm" class="mb-6 p-4 border rounded-lg bg-muted/30">
          <h4 class="font-medium mb-4">添加新订阅</h4>
          <form @submit.prevent="addSubscribe" class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input v-model="newSubscribe.name" placeholder="订阅名称" required />
            <Input v-model="newSubscribe.url" type="url" placeholder="RSS URL" required />
            <Input v-model="newSubscribe.avatar" type="url" placeholder="头像 URL（可选）" />
            <div class="flex gap-2">
              <Button type="submit">添加</Button>
              <Button type="button" variant="outline" @click="cancelAdd">取消</Button>
            </div>
          </form>
        </div>

        <!-- 订阅列表 -->
        <div v-if="loading" class="text-center py-8">
          <Icon name="lucide:loader-2" class="size-8 animate-spin mx-auto text-muted-foreground" />
          <p class="text-sm text-muted-foreground mt-2">加载中...</p>
        </div>

        <div v-else-if="subscribes.length > 0" class="space-y-4">
          <div
            v-for="sub in subscribes"
            :key="sub.id"
            class="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
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
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-16">
          <Icon name="lucide:rss" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground">暂无订阅源</p>
          <Button variant="outline" class="mt-4" @click="showAddForm = true">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            添加第一个订阅
          </Button>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>
