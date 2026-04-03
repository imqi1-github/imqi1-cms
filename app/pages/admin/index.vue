<script setup lang="ts">
const loading = ref(true)
const stats = ref({
  posts: 0,
  comments: 0,
  categories: 0,
  users: 0,
})

const recentPosts = ref<any[]>([])

const statCards = [
  {
    title: '文章总数',
    value: stats.value.posts,
    icon: 'lucide:file-text',
    color: 'text-blue-500',
  },
  {
    title: '评论总数',
    value: stats.value.comments,
    icon: 'lucide:message-square',
    color: 'text-green-500',
  },
  {
    title: '分类数量',
    value: stats.value.categories,
    icon: 'lucide:folder',
    color: 'text-yellow-500',
  },
  {
    title: '用户数量',
    value: stats.value.users,
    icon: 'lucide:users',
    color: 'text-purple-500',
  },
]

async function fetchData() {
  loading.value = true
  try {
    const [statsRes, postsRes] = await Promise.all([
      $fetch('/api/admin/stats'),
      $fetch('/api/admin/recent-posts'),
    ])
    stats.value = statsRes as any
    recentPosts.value = postsRes as any[]
  } catch (error) {
    console.error('获取数据失败:', error)
  } finally {
    loading.value = false
  }
}

async function deletePost(cid: number) {
  const confirmed = confirm('确定要删除这篇文章吗？')
  if (confirmed) {
    await $fetch(`/api/admin/posts/${cid}`, { method: 'DELETE' })
    await fetchData()
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <AdminLayout>
    <!-- 页面标题 -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">仪表盘</h2>
      <Button>
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建文章
      </Button>
    </div>

    <!-- 统计卡片骨架屏 -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card v-for="i in 4" :key="i">
        <CardContent class="p-6">
          <div class="flex items-center justify-between">
            <div class="space-y-2 flex-1">
              <div class="h-4 bg-muted rounded w-20 animate-pulse" />
              <div class="h-8 bg-muted rounded w-16 animate-pulse" />
            </div>
            <div class="size-8 bg-muted rounded-lg animate-pulse" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 统计卡片 -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card v-for="card in statCards" :key="card.title">
        <CardContent class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">{{ card.title }}</p>
              <p class="text-2xl font-bold mt-1">{{ stats[card.title === '文章总数' ? 'posts' : card.title === '评论总数' ? 'comments' : card.title === '分类数量' ? 'categories' : 'users'] }}</p>
            </div>
            <Icon :name="card.icon" class="size-8 text-muted-foreground/30" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 最新文章 -->
    <Card>
      <CardHeader>
        <CardTitle>最新文章</CardTitle>
        <CardDescription>最近发布的文章列表</CardDescription>
      </CardHeader>
      <CardContent>
        <!-- 加载状态 -->
        <div v-if="loading" class="space-y-4">
          <div v-for="i in 5" :key="i" class="flex items-center justify-between py-3 border-b">
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
              <div class="h-3 bg-muted rounded w-1/4 animate-pulse" />
            </div>
            <div class="flex items-center gap-2">
              <div class="h-6 bg-muted rounded w-12 animate-pulse" />
              <div class="size-8 bg-muted rounded-lg animate-pulse" />
              <div class="size-8 bg-muted rounded-lg animate-pulse" />
            </div>
          </div>
        </div>

        <!-- 文章列表 -->
        <div v-else-if="recentPosts.length > 0">
          <div class="space-y-4">
            <div
              v-for="post in recentPosts"
              :key="post.cid"
              class="flex items-center justify-between py-3 border-b last:border-0"
            >
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate">{{ post.title }}</p>
                <p class="text-sm text-muted-foreground">{{ formatDate(post.create_time) }}</p>
              </div>
              <div class="flex items-center gap-2">
                <Badge variant="outline">{{ post.status || '已发布' }}</Badge>
                <Button variant="ghost" size="icon" class="size-8">
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
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-12">
          <Icon name="lucide:file-text" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground">暂无文章</p>
          <Button variant="outline" class="mt-4">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            创建第一篇文章
          </Button>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>
