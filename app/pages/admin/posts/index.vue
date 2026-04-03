<script setup lang="ts">
const router = useRouter()
const loading = ref(true)
const posts = ref<any[]>([])
const pagination = ref({
  page: 1,
  pageSize: 5,
  total: 0,
  totalPages: 0,
})

async function fetchPosts(page: number = 1) {
  loading.value = true
  try {
    const res = await $fetch(`/api/admin/posts?page=${page}&pageSize=5`) as any
    posts.value = res.data || []
    pagination.value = res.pagination || pagination.value
  } catch (error) {
    console.error('获取文章失败:', error)
    posts.value = []
  } finally {
    loading.value = false
  }
}

async function deletePost(cid: number) {
  const confirmed = confirm('确定要删除这篇文章吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/posts/${cid}`, { method: 'DELETE' })
      await fetchPosts(pagination.value.page)
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

function getStatusBadge(status: number) {
  return status === 1
    ? { label: '已发布', variant: 'default' as const }
    : { label: '草稿', variant: 'secondary' as const }
}

function editPost(cid: number) {
  router.push(`/admin/posts/edit?cid=${cid}`)
}

function createPost() {
  router.push('/admin/posts/edit')
}

function goToPage(page: number) {
  if (page >= 1 && page <= pagination.value.totalPages) {
    fetchPosts(page)
  }
}

onMounted(() => {
  fetchPosts()
})
</script>

<template>
  <AdminLayout>
    <!-- 页面标题 -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">文章管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理所有文章内容</p>
      </div>
      <Button @click="createPost">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建文章
      </Button>
    </div>

    <!-- 文章列表 -->
    <Card>
      <!-- 加载状态 -->
      <div v-if="loading" class="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>评论数</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="i in 5" :key="i">
              <TableCell>
                <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-6 bg-muted rounded w-12 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-8 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-20 animate-pulse" />
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <div class="size-8 bg-muted rounded-lg animate-pulse" />
                  <div class="size-8 bg-muted rounded-lg animate-pulse" />
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 数据列表 -->
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead>标题</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>评论数</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="post in posts" :key="post.cid">
            <TableCell class="font-medium">{{ post.title }}</TableCell>
            <TableCell>
              <Badge :variant="getStatusBadge(post.status).variant">
                {{ getStatusBadge(post.status).label }}
              </Badge>
            </TableCell>
            <TableCell>{{ post.comment_num || 0 }}</TableCell>
            <TableCell>{{ formatDate(post.create_time) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8" @click="editPost(post.cid)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  @click="deletePost(post.cid)"
                >
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 空状态 -->
      <div v-if="!loading && posts.length === 0" class="text-center py-12">
        <Icon name="lucide:file-text" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无文章</p>
        <Button variant="outline" class="mt-4" @click="createPost">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一篇文章
        </Button>
      </div>

      <!-- 分页 -->
      <div v-if="!loading && pagination.totalPages > 1" class="flex items-center justify-between pt-4 pb-2 border-t">
        <p class="text-sm text-muted-foreground">
          共 {{ pagination.total }} 篇文章，第 {{ pagination.page }} / {{ pagination.totalPages }} 页
        </p>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="pagination.page <= 1"
            @click="goToPage(pagination.page - 1)"
          >
            <Icon name="lucide:chevron-left" class="size-4" />
            上一页
          </Button>
          <div class="flex items-center gap-1">
            <Button
              v-for="page in Math.min(pagination.totalPages, 5)"
              :key="page"
              variant="outline"
              size="sm"
              :class="{ 'bg-primary text-primary-foreground': page === pagination.page }"
              @click="goToPage(page)"
            >
              {{ page }}
            </Button>
            <span v-if="pagination.totalPages > 5" class="px-2 text-muted-foreground">...</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="pagination.page >= pagination.totalPages"
            @click="goToPage(pagination.page + 1)"
          >
            下一页
            <Icon name="lucide:chevron-right" class="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  </AdminLayout>
</template>
