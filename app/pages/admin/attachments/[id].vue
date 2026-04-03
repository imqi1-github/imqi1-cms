<script setup lang="ts">
const route = useRoute()
const loading = ref(true)
const saving = ref(false)

const attachment = ref<any>(null)

const form = ref({
  name: '',
  alt: '',
  desc: '',
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
  return new Date(date).toLocaleString('zh-CN')
}

async function fetchAttachment() {
  loading.value = true
  try {
    // TODO: 实际 API 调用
    // attachment.value = await $fetch(`/api/admin/attachments/${route.params.id}`)
    console.log('获取附件:', route.params.id)
  } catch (error) {
    console.error('获取附件失败:', error)
  } finally {
    loading.value = false
  }
}

async function saveAttachment() {
  saving.value = true
  try {
    // TODO: 实际 API 调用
    await $fetch(`/api/admin/attachments/${route.params.id}`, {
      method: 'PATCH',
      body: form.value,
    })
    // await fetchAttachment()
  } catch (error) {
    console.error('保存失败:', error)
  } finally {
    saving.value = false
  }
}

async function deleteAttachment() {
  const confirmed = confirm('确定要删除这个附件吗？此操作不可恢复！')
  if (confirmed) {
    try {
      // TODO: 实际 API 调用
      await $fetch(`/api/admin/attachments/${route.params.id}`, {
        method: 'DELETE',
      })
      await navigateTo('/admin/attachments')
    } catch (error) {
      console.error('删除失败:', error)
    }
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
        <Button @click="saveAttachment" :disabled="saving">
          <Icon name="lucide:save" class="mr-2 size-4" />
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
                  :alt="attachment.alt || attachment.name"
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
                <Button variant="outline" size="icon">
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
            <CardDescription>编辑附件的名称、描述等信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="loading" class="space-y-4">
              <div class="h-10 bg-muted rounded animate-pulse" />
              <div class="h-10 bg-muted rounded animate-pulse" />
              <div class="h-32 bg-muted rounded animate-pulse" />
            </div>
            <form v-else class="space-y-4">
              <div class="space-y-2">
                <Label for="fileName">文件名</Label>
                <Input id="fileName" v-model="form.name" placeholder="附件名称" />
              </div>
              <div class="space-y-2">
                <Label for="altText">替代文本</Label>
                <Input id="altText" v-model="form.alt" placeholder="图片的替代文本，用于辅助访问" />
                <p class="text-xs text-muted-foreground">
                  用于图片无法显示时的替代文本，也有助于 SEO 和无障碍访问
                </p>
              </div>
              <div class="space-y-2">
                <Label for="desc">描述</Label>
                <Textarea
                  id="desc"
                  v-model="form.desc"
                  placeholder="附件描述..."
                  rows="4"
                />
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
                <dt class="text-muted-foreground">宽度</dt>
                <dd>{{ attachment.width || '-' }} px</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted-foreground">高度</dt>
                <dd>{{ attachment.height || '-' }} px</dd>
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
              <div class="flex justify-between">
                <dt class="text-muted-foreground">上传者</dt>
                <dd>{{ attachment.uploader || '-' }}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <!-- 使用统计卡片 -->
        <Card>
          <CardHeader>
            <CardTitle>使用统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="loading" class="space-y-4">
              <div v-for="i in 3" :key="i" class="flex justify-between">
                <div class="h-4 bg-muted rounded w-20 animate-pulse" />
                <div class="h-4 bg-muted rounded w-24 animate-pulse" />
              </div>
            </div>
            <dl v-else class="space-y-4 text-sm">
              <div class="flex justify-between">
                <dt class="text-muted-foreground">被引用</dt>
                <dd class="font-medium">{{ attachment?.usageCount || 0 }} 次</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted-foreground">所属文章</dt>
                <dd>{{ attachment?.postCount || 0 }} 篇</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted-foreground">最后使用</dt>
                <dd>{{ attachment?.lastUsed ? formatDate(attachment.lastUsed) : '从未' }}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  </AdminLayout>
</template>
