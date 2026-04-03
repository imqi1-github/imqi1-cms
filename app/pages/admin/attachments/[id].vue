<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const loading = ref(true)
const saving = ref(false)

const attachment = ref<any>(null)

const form = ref({
  name: '',
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
  if (!bytes || bytes === 0) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleString('zh-CN')
}

async function fetchAttachment() {
  loading.value = true
  try {
    const res = await $fetch(`/api/admin/attachments/${route.params.id}`) as any
    if (res?.success) {
      attachment.value = res.data
      form.value.name = res.data.name
    }
  } catch (error: any) {
    console.error('获取附件失败:', error)
    toast.error({
      message: error.message || '获取附件失败',
    })
  } finally {
    loading.value = false
  }
}

async function saveAttachment() {
  saving.value = true
  try {
    const res = await $fetch(`/api/admin/attachments/${route.params.id}`, {
      method: 'PATCH',
      body: {
        name: form.value.name,
      },
    }) as any

    if (res?.success) {
      toast.success({
        message: '保存成功',
      })
      await fetchAttachment()
    }
  } catch (error: any) {
    console.error('保存失败:', error)
    toast.error({
      message: error.message || '保存失败',
    })
  } finally {
    saving.value = false
  }
}

async function deleteAttachment() {
  const confirmed = confirm('确定要删除这个附件吗？此操作不可恢复！')
  if (!confirmed) return

  try {
    await $fetch(`/api/attachments/${route.params.id}`, {
      method: 'DELETE',
    })
    toast.success({
      message: '删除成功',
    })
    await navigateTo('/admin/attachments')
  } catch (error: any) {
    console.error('删除失败:', error)
    toast.error({
      message: error.message || '删除失败',
    })
  }
}

// 复制链接
const copyLink = async () => {
  if (!attachment.value?.url) return
  const fullUrl = `${window.location.origin}${attachment.value.url}`
  try {
    await navigator.clipboard.writeText(fullUrl)
    toast.success({
      message: '已复制链接',
      description: fullUrl,
    })
  } catch {
    toast.error({
      message: '复制失败',
    })
  }
}

onMounted(() => {
  fetchAttachment()
})
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="navigateTo('/admin/attachments')">
          <Icon name="lucide:arrow-left" class="size-5" />
        </Button>
        <div>
          <h2 class="text-2xl font-bold">附件详情</h2>
          <p class="text-sm text-muted-foreground mt-1">查看和编辑附件信息</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" @click="deleteAttachment">
          <Icon name="lucide:trash-2" class="mr-2 size-4" />
          删除
        </Button>
        <Button @click="saveAttachment" :disabled="saving || loading">
          <Icon :name="saving ? 'lucide:loader-2' : 'lucide:save'" :class="{ 'animate-spin': saving }" class="mr-2 size-4" />
          {{ saving ? '保存中...' : '保存' }}
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 左侧：预览和基本信息 -->
      <div class="lg:col-span-2 space-y-6">
        <!-- 预览卡片 -->
        <Card>
          <CardHeader>
            <CardTitle>预览</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="loading" class="aspect-video bg-muted rounded-lg animate-pulse" />
            <div v-else-if="attachment" class="space-y-4">
              <!-- 图片预览 -->
              <div v-if="attachment.type === 'image'" class="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                <img
                  :src="attachment.url"
                  :alt="attachment.name"
                  class="max-w-full max-h-full object-contain"
                />
              </div>
              <!-- 视频预览 -->
              <div v-else class="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                <video
                  :src="attachment.url"
                  controls
                  class="max-w-full max-h-full"
                />
              </div>
              <!-- 复制链接 -->
              <div class="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Input
                  :value="attachment?.url"
                  readonly
                  class="flex-1 bg-background"
                />
                <Button variant="outline" size="icon" @click="copyLink">
                  <Icon name="lucide:copy" class="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 编辑信息卡片 -->
        <Card>
          <CardHeader>
            <CardTitle>附件信息</CardTitle>
            <CardDescription>编辑附件的名称</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="loading" class="space-y-4">
              <div class="h-10 bg-muted rounded animate-pulse" />
            </div>
            <form v-else class="space-y-4">
              <div class="space-y-2">
                <Label for="fileName">文件名</Label>
                <Input id="fileName" v-model="form.name" placeholder="附件名称" />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <!-- 右侧：属性信息 -->
      <div class="space-y-6">
        <!-- 属性卡片 -->
        <Card>
          <CardHeader>
            <CardTitle>文件属性</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="loading" class="space-y-4">
              <div v-for="i in 5" :key="i" class="flex justify-between">
                <div class="h-4 bg-muted rounded w-20 animate-pulse" />
                <div class="h-4 bg-muted rounded w-24 animate-pulse" />
              </div>
            </div>
            <dl v-else-if="attachment" class="space-y-4 text-sm">
              <div class="flex justify-between">
                <dt class="text-muted-foreground">类型</dt>
                <dd class="flex items-center gap-2">
                  <Icon :name="getTypeIcon(attachment.type)" class="size-4" />
                  {{ getTypeLabel(attachment.type) }}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted-foreground">大小</dt>
                <dd>{{ formatFileSize(attachment.size) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted-foreground">格式</dt>
                <dd class="uppercase">{{ attachment.format || '-' }}</dd>
              </div>
              <Separator />
              <div class="flex justify-between">
                <dt class="text-muted-foreground">上传时间</dt>
                <dd>{{ formatDate(attachment.createdAt) }}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <!-- 关联文章卡片 -->
        <Card>
          <CardHeader>
            <CardTitle>关联文章</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="loading" class="space-y-4">
              <div class="h-4 bg-muted rounded w-full animate-pulse" />
            </div>
            <div v-else-if="attachment?.post" class="text-sm">
              <NuxtLink
                :to="`/admin/posts/edit?cid=${attachment.post.cid}`"
                class="flex items-center gap-2 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <Icon name="lucide:file-text" class="size-4 text-muted-foreground" />
                <div class="flex-1 min-w-0">
                  <p class="font-medium truncate">{{ attachment.post.title }}</p>
                  <p class="text-xs text-muted-foreground"> Slug: {{ attachment.post.slug }}</p>
                </div>
                <Icon name="lucide:chevron-right" class="size-4 text-muted-foreground" />
              </NuxtLink>
            </div>
            <div v-else class="text-sm text-muted-foreground text-center py-4">
              未关联文章
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </AdminLayout>
</template>
