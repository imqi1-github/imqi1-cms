<script setup lang="ts">
import type {AttachmentDetail, AttachmentDetailResponse, AttachmentUpdateResponse} from "~/types/apis/admin/attachments";
import type { PageItem, PageListResponse } from "~/types/apis/admin/pages";
import type { AdminContent, AdminContentListResponse } from "~/types/apis/admin/contents";
import type { CsrfResponse } from "~/types/apis/admin/categories";
import type {ApiError} from "~/types/error";

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()
const loading = ref(true)
const saving = ref(false)
const csrfToken = ref("")

const attachment = ref<AttachmentDetail | null>(null)
const uploadContents = ref<AdminContent[]>([])
const uploadPages = ref<PageItem[]>([])
const selectedContentId = ref("")

const relationTargets = computed(() => [
  ...uploadContents.value.map(content => ({
    value: String(content.cid),
    cid: content.cid,
    label: content.title || `文章 #${content.cid}`,
    type: "文章",
  })),
  ...uploadPages.value.map(pageItem => ({
    value: String(pageItem.cid),
    cid: pageItem.cid,
    label: pageItem.title || `页面 #${pageItem.cid}`,
    type: "页面",
  })),
])

const pageCidSet = computed(() => new Set(uploadPages.value.map(pageItem => pageItem.cid)))

const getRelationTypeLabel = (cid: number) => pageCidSet.value.has(cid) ? "页面" : "文章"

const getRelationEditPath = (cid: number) => pageCidSet.value.has(cid)
  ? `/admin/pages/edit?cid=${cid}`
  : `/admin/contents/edit?cid=${cid}`

const availableRelationTargets = computed(() => {
  const linked = new Set(attachment.value?.contents.map(content => content.cid) ?? [])
  return relationTargets.value.filter(target => !linked.has(target.cid))
})

// 动态 id 拼出的 URL 会同时命中 `/api/admin/attachments/:id` 与字面路由 `/all`，
// 导致响应类型变成两者并集、可用方法被取交集只剩 get。这里用显式返回类型泛型绕过路由推断，
// 既收敛响应类型又避免对 InternalApi 全表做 MatchedRoutes 深递归（会触发"堆栈深度过高"）。
const attachmentDetailUrl = `/api/admin/attachments/${route.params.id}`;

// 返回附件列表：保留来源页码（由列表页 ?page= 带入），退出后仍在那一页
function backToAttachments() {
  const pageParam = typeof route.query.page === "string" ? route.query.page : undefined;
  return navigateTo({
    path: "/admin/attachments",
    query: pageParam ? { page: pageParam } : {},
  });
}

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

const formatImageDimensions = (item: { width?: number | null; height?: number | null }) => {
  if (!item.width || !item.height) return '-'
  return `${item.width} × ${item.height}`
}

async function fetchAttachment() {
  loading.value = true
  try {
    // 获取 CSRF token
    const csrfRes = await $fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" })
    if (csrfRes?.data?.token) csrfToken.value = csrfRes.data.token

    const res = await $fetch<AttachmentDetailResponse>(attachmentDetailUrl)
    if (res?.success) {
      attachment.value = res.data
      form.value.name = res.data.name
    }
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    console.error('获取附件失败:', error)
    toast.error({
      message: error.message || '获取附件失败',
    })
  } finally {
    loading.value = false
  }
}

async function fetchRelationTargets() {
  try {
    const [contentsRes, pagesRes] = await Promise.all([
      $fetch<AdminContentListResponse>("/api/admin/contents?pageSize=999"),
      $fetch<PageListResponse>("/api/admin/pages?pageSize=999"),
    ])
    uploadContents.value = contentsRes.data || []
    uploadPages.value = pagesRes.data || []
  } catch (error) {
    console.error('获取关联目标失败:', error)
  }
}

async function syncRelations(cids: number[]) {
  const res = await $fetch<AttachmentUpdateResponse>(attachmentDetailUrl, {
    method: 'PATCH',
    body: {
      name: form.value.name,
      cids,
      csrfToken: csrfToken.value,
    },
  })

  if (res?.success) {
    await fetchAttachment()
  }
}

async function addRelation() {
  if (!attachment.value || !selectedContentId.value) return
  const cid = Number(selectedContentId.value)
  if (!Number.isInteger(cid)) return

  try {
    await syncRelations([...attachment.value.contents.map(content => content.cid), cid])
    selectedContentId.value = ""
    toast.success({ message: '关联成功' })
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    toast.error({ message: error.message || '关联失败' })
  }
}

async function removeRelation(cid: number) {
  if (!attachment.value) return

  try {
    await syncRelations(attachment.value.contents.map(content => content.cid).filter(contentCid => contentCid !== cid))
    toast.success({ message: '已取消关联' })
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    toast.error({ message: error.message || '取消关联失败' })
  }
}

async function saveAttachment() {
  saving.value = true
  try {
    const res = await $fetch<AttachmentUpdateResponse>(attachmentDetailUrl, {
      method: 'PATCH',
      body: {
        name: form.value.name,
        csrfToken: csrfToken.value,
      },
    })

    if (res?.success) {
      toast.success({
        message: '保存成功',
      })
      await fetchAttachment()
    }
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    console.error('保存失败:', error)
    toast.error({
      message: error.message || '保存失败',
    })
  } finally {
    saving.value = false
  }
}

async function deleteAttachment() {
  const confirmed = await confirm({
    title: '删除附件',
    description: '确定要删除这个附件吗？此操作不可恢复！',
    variant: 'destructive',
    confirmText: '确认删除',
    icon: 'lucide:trash-2',
  })
  if (!confirmed) return

  try {
    await $fetch(`/api/attachments/${route.params.id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken.value },
    })
    toast.success({
      message: '删除成功',
    })
    await backToAttachments()
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    console.error('删除失败:', error)
    toast.error({
      message: error.message || '删除失败',
    })
  }
}

// 复制链接
const copyLink = async () => {
  if (!attachment.value?.url) return

  // 判断是否已经是完整的 URL（云存储）
  const isFullUrl = attachment.value.url.startsWith('http://') || attachment.value.url.startsWith('https://')
  const fullUrl = isFullUrl ? attachment.value.url : `${window.location.origin}${attachment.value.url}`

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
  fetchRelationTargets()
})
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="backToAttachments">
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
        <Button :disabled="saving || loading" @click="saveAttachment">
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
                >
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
                <div class="flex-1 font-mono text-xs bg-background border rounded-md px-3 py-2 truncate select-all cursor-text" :title="attachment?.url">
                  {{ attachment?.url }}
                </div>
                <Button variant="outline" size="icon" title="复制链接" @click="copyLink">
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
              <div v-if="attachment.type === 'image'" class="flex justify-between">
                <dt class="text-muted-foreground">宽高</dt>
                <dd>{{ formatImageDimensions(attachment) }}</dd>
              </div>
              <Separator />
              <div class="flex justify-between">
                <dt class="text-muted-foreground">上传时间</dt>
                <dd>{{ formatDate(attachment.createdAt) }}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <!-- 关联文章/页面卡片 -->
        <Card>
          <CardHeader>
            <CardTitle>关联内容</CardTitle>
            <CardDescription>管理当前附件关联的文章或页面</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="loading" class="space-y-4">
              <div class="h-4 bg-muted rounded w-full animate-pulse" />
            </div>
            <div v-else-if="attachment" class="space-y-4">
              <div v-if="attachment.contents.length > 0" class="space-y-2">
                <div
                  v-for="content in attachment.contents"
                  :key="content.cid"
                  class="flex items-center gap-2 rounded-lg border p-3"
                >
                  <NuxtLink
                    :to="getRelationEditPath(content.cid)"
                    class="flex min-w-0 flex-1 items-center gap-2 hover:text-primary"
                  >
                    <Icon name="lucide:file-text" class="size-4 shrink-0 text-muted-foreground" />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <Badge variant="outline" class="shrink-0 text-xs">
                          {{ getRelationTypeLabel(content.cid) }}
                        </Badge>
                        <p class="truncate text-sm font-medium">{{ content.title }}</p>
                      </div>
                      <p class="mt-1 truncate text-xs text-muted-foreground">Slug: {{ content.slug || '-' }}</p>
                    </div>
                  </NuxtLink>
                  <Button variant="ghost" size="icon" title="取消关联" @click="removeRelation(content.cid)">
                    <Icon name="lucide:x" class="size-4" />
                  </Button>
                </div>
              </div>
              <div v-else class="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                未关联内容
              </div>

              <div class="flex gap-2">
                <ClientOnly>
                  <Select v-model="selectedContentId" :disabled="availableRelationTargets.length === 0">
                    <SelectTrigger class="min-w-0 flex-1">
                      <SelectValue placeholder="选择要关联的文章或页面" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="target in availableRelationTargets" :key="target.value" :value="target.value">
                        {{ target.type }}：{{ target.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <template #fallback>
                    <div class="h-9 min-w-0 flex-1 rounded-md border bg-muted/50" />
                  </template>
                </ClientOnly>
                <Button :disabled="!selectedContentId" @click="addRelation">
                  添加
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </AdminLayout>
</template>
