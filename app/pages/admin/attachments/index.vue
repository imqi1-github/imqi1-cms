<script setup lang="ts">
const loading = ref(true)
const attachments = ref<any[]>([])
const selectedType = ref('all')
const searchQuery = ref('')

const attachmentTypes = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]

const mockAttachments: any[] = []

// 模拟数据加载
onMounted(() => {
  setTimeout(() => {
    attachments.value = mockAttachments
    loading.value = false
  }, 500)
})

const filteredAttachments = computed(() => {
  let result = attachments.value

  if (selectedType.value !== 'all') {
    result = result.filter((a: any) => a.type === selectedType.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((a: any) =>
      a.name.toLowerCase().includes(query)
    )
  }

  return result
})

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    image: '图片',
    video: '视频',
  }
  return map[type] || type
}

const getTypeIcon = (type: string) => {
  const map: Record<string, string> = {
    image: 'lucide:image',
    video: 'lucide:film',
  }
  return map[type] || 'lucide:file'
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('zh-CN')
}

async function deleteAttachment(id: number) {
  const confirmed = confirm('确定要删除这个附件吗？')
  if (confirmed) {
    // TODO: 实现删除逻辑
    console.log('删除附件:', id)
  }
}
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">附件管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理图片和视频附件</p>
      </div>
      <Button>
        <Icon name="lucide:upload" class="mr-2 size-4" />
        上传附件
      </Button>
    </div>

    <!-- 筛选栏 -->
    <Card class="mb-4">
      <div class="flex items-center gap-4 p-4">
        <div class="flex items-center gap-2">
          <Label for="typeFilter">类型:</Label>
          <Select id="typeFilter" v-model="selectedType">
            <SelectTrigger class="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="type in attachmentTypes"
                :key="type.value"
                :value="type.value"
              >
                {{ type.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex-1">
          <div class="relative">
            <Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              placeholder="搜索附件名称..."
              class="pl-10"
            />
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <!-- 加载状态 -->
      <div v-if="loading" class="p-4">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div v-for="i in 10" :key="i" class="space-y-2">
            <div class="aspect-square bg-muted rounded-lg animate-pulse" />
            <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
            <div class="h-3 bg-muted rounded w-1/2 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="filteredAttachments.length === 0" class="text-center py-16">
        <Icon name="lucide:paperclip" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground text-lg mb-2">暂无附件</p>
        <p class="text-sm text-muted-foreground mb-4">点击下方按钮上传第一个附件</p>
        <Button>
          <Icon name="lucide:upload" class="mr-2 size-4" />
          上传附件
        </Button>
      </div>

      <!-- 附件网格 -->
      <div v-else class="p-4">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div
            v-for="item in filteredAttachments"
            :key="item.id"
            class="group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
          >
            <!-- 预览图 -->
            <NuxtLink :to="`/admin/attachments/${item.id}`" class="block">
              <div class="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                <img
                  v-if="item.type === 'image'"
                  :src="item.url"
                  :alt="item.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div v-else class="flex flex-col items-center text-muted-foreground">
                  <Icon :name="getTypeIcon(item.type)" class="size-12 mb-2" />
                  <span class="text-xs">视频预览</span>
                </div>
              </div>
            </NuxtLink>

            <!-- 操作遮罩 -->
            <div class="absolute inset-0 top-[calc(100%-60px)] bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-2 pb-2">
              <Button
                variant="secondary"
                size="sm"
                class="h-8"
                @click="navigateTo(`/admin/attachments/${item.id}`)"
              >
                <Icon name="lucide:settings" class="size-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                class="h-8"
                @click="deleteAttachment(item.id)"
              >
                <Icon name="lucide:trash-2" class="size-4" />
              </Button>
            </div>

            <!-- 信息 -->
            <div class="p-3">
              <p class="text-sm font-medium truncate" :title="item.name">
                {{ item.name }}
              </p>
              <div class="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <Badge variant="outline" class="text-xs">
                  {{ getTypeLabel(item.type) }}
                </Badge>
                <span>{{ formatFileSize(item.size) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  </AdminLayout>
</template>
