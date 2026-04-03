<script setup lang="ts">
const router = useRouter()
const posts = ref<any[]>([])

async function fetchPosts() {
  try {
    posts.value = await $fetch('/api/admin/posts') as any[]
  } catch (error) {
    console.error('获取文章失败:', error)
    posts.value = []
  }
}

async function deletePost(cid: number) {
  const confirmed = confirm('确定要删除这篇文章吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/posts/${cid}`, { method: 'DELETE' })
      await fetchPosts()
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
      <div v-if="posts.length === 0" class="text-center py-12">
        <Icon name="lucide:file-text" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无文章</p>
        <Button variant="outline" class="mt-4" @click="createPost">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一篇文章
        </Button>
      </div>
    </Card>
  </AdminLayout>
</template>
