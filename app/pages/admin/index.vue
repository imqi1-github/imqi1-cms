<script setup lang="ts">
import type {PopularPost, RecentComment, RecentPost} from "~/types/apis/admin";

const router = useRouter()
const loading = ref(true)
const stats = ref({
  posts: 0,
  comments: 0,
  categories: 0,
  users: 0,
})

const detailedStats = ref({
  posts: {
    total: 0,
    published: 0,
    draft: 0,
    thisMonth: 0,
    thisWeek: 0,
  },
  pages: {
    total: 0,
  },
  comments: {
    total: 0,
    pending: 0,
    thisMonth: 0,
  },
  categories: {
    total: 0,
  },
  tags: {
    total: 0,
  },
  users: {
    total: 0,
    online: 0,
  },
})

const systemInfo = ref({
  nodeVersion: '',
  platform: '',
  architecture: '',
  uptime: '',
  memory: { used: 0, total: 0, unit: 'MB' },
  database: { version: '' },
  attachments: { count: 0, totalSize: 0 },
})

const recentPosts = ref<RecentPost[]>([])
const recentComments = ref<RecentComment[]>([])
const popularPosts = ref<PopularPost[]>([])

const statCards = [
  {
    title: '文章总数',
    value: stats.value.posts,
    icon: 'lucide:file-text',
    color: 'text-blue-500',
    description: '已发布文章',
    badge: detailedStats.value.posts.thisMonth > 0 ? `本月 +${detailedStats.value.posts.thisMonth}` : '',
  },
  {
    title: '评论总数',
    value: stats.value.comments,
    icon: 'lucide:message-square',
    color: 'text-green-500',
    description: '所有评论',
    badge: detailedStats.value.comments.pending > 0 ? `${detailedStats.value.comments.pending} 待审核` : '',
  },
  {
    title: '分类标签',
    value: stats.value.categories,
    icon: 'lucide:folder',
    color: 'text-yellow-500',
    description: `${detailedStats.value.categories.total} 分类 / ${detailedStats.value.tags.total} 标签`,
  },
  {
    title: '用户数量',
    value: stats.value.users,
    icon: 'lucide:users',
    color: 'text-purple-500',
    description: '注册用户',
  },
]

// 获取统计卡片的徽章
const getStatCardBadge = (title: string) => {
  if (title === '文章总数' && detailedStats.value.posts.thisMonth > 0) {
    return `本月 +${detailedStats.value.posts.thisMonth}`
  }
  if (title === '评论总数' && detailedStats.value.comments.pending > 0) {
    return `${detailedStats.value.comments.pending} 待审核`
  }
  return ''
}

// 获取统计卡片的描述
const getStatCardDescription = (title: string) => {
  if (title === '分类标签') {
    return `${detailedStats.value.categories.total} 分类 / ${detailedStats.value.tags.total} 标签`
  }
  const descriptions: Record<string, string> = {
    '文章总数': '已发布文章',
    '评论总数': '所有评论',
    '用户数量': '注册用户',
  }
  return descriptions[title] || ''
}

const additionalStatCards = [
  {
    title: '页面数量',
    value: detailedStats.value.pages.total,
    icon: 'lucide:file',
    color: 'text-cyan-500',
    description: '独立页面',
  },
  {
    title: '草稿数量',
    value: detailedStats.value.posts.draft,
    icon: 'lucide:file-edit',
    color: 'text-orange-500',
    description: '未发布文章',
  },
]

async function fetchData() {
  loading.value = true
  try {
    const [statsRes, detailedRes, systemRes, postsRes, commentsRes, popularRes] = await Promise.all([
      $fetch('/api/admin/stats'),
      $fetch('/api/admin/detailed-stats'),
      $fetch('/api/admin/system-info'),
      $fetch('/api/admin/recent-posts'),
      $fetch('/api/admin/recent-comments'),
      $fetch('/api/admin/popular-posts'),
    ])
    stats.value = statsRes
    detailedStats.value = detailedRes
    systemInfo.value = systemRes
    recentPosts.value = postsRes
    recentComments.value = commentsRes
    popularPosts.value = popularRes
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

async function deleteComment(coid: number) {
  const confirmed = confirm('确定要删除这条评论吗？')
  if (confirmed) {
    await $fetch(`/api/admin/comments/${coid}`, { method: 'DELETE' })
    await fetchData()
  }
}

function editPost(cid: number) {
  router.push(`/admin/posts/edit?cid=${cid}`)
}

function createPost() {
  router.push('/admin/posts/edit')
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('zh-CN')
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <AdminLayout>
    <!-- 页面标题 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold">仪表盘</h2>
      <Button class="w-full sm:w-auto" @click="createPost">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建文章
      </Button>
    </div>

    <!-- 统计卡片骨架屏 -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <Card v-for="i in 4" :key="i">
        <CardContent class="p-4 sm:p-6">
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-2 flex-1">
              <div class="h-4 bg-muted rounded w-20 animate-pulse" />
              <div class="h-8 bg-muted rounded w-16 animate-pulse" />
            </div>
            <div class="size-8 bg-muted rounded-lg animate-pulse shrink-0" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 主要统计卡片 -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <Card v-for="card in statCards" :key="card.title" class="hover:shadow-md transition-shadow">
        <CardContent class="p-4 sm:p-6">
          <div class="flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1 gap-2">
                <p class="text-sm text-muted-foreground truncate">{{ card.title }}</p>
                <Badge v-if="getStatCardBadge(card.title)" variant="secondary" class="text-xs shrink-0">{{ getStatCardBadge(card.title) }}</Badge>
              </div>
              <p class="text-2xl sm:text-3xl font-bold mt-1 truncate">{{ stats[card.title === '文章总数' ? 'posts' : card.title === '评论总数' ? 'comments' : card.title === '分类标签' ? 'categories' : 'users'] }}</p>
              <p class="text-xs text-muted-foreground mt-1 truncate">{{ getStatCardDescription(card.title) }}</p>
            </div>
            <Icon :name="card.icon" class="size-8 sm:size-10 text-muted-foreground/30 shrink-0" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 附加统计卡片 -->
    <div v-if="!loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
      <Card v-for="card in additionalStatCards" :key="card.title" class="hover:shadow-md transition-shadow">
        <CardContent class="p-4 sm:p-6">
          <div class="flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm text-muted-foreground">{{ card.title }}</p>
              <p class="text-2xl sm:text-3xl font-bold mt-1">{{ card.value }}</p>
              <p class="text-xs text-muted-foreground mt-1 truncate">{{ card.description }}</p>
            </div>
            <Icon :name="card.icon" class="size-8 sm:size-10 text-muted-foreground/30 shrink-0" />
          </div>
        </CardContent>
      </Card>

      <!-- 系统信息卡片 -->
      <Card class="hover:shadow-md transition-shadow">
        <CardContent class="p-4 sm:p-6">
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm text-muted-foreground">系统运行时间</p>
            <Icon name="lucide:activity" class="size-4 text-muted-foreground/50 shrink-0" />
          </div>
          <p class="text-base sm:text-lg font-bold truncate">{{ systemInfo.uptime }}</p>
          <div class="mt-3 pt-3 border-t">
            <div class="flex items-center justify-between text-xs gap-2">
              <span class="text-muted-foreground shrink-0">内存使用</span>
              <span class="font-medium truncate">{{ systemInfo.memory.used }} / {{ systemInfo.memory.total }} {{ systemInfo.memory.unit }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 最新文章 -->
    <Card class="mb-4 sm:mb-6">
      <CardHeader class="space-y-1">
        <CardTitle class="text-lg sm:text-xl">最新文章</CardTitle>
        <CardDescription class="text-sm">最近发布的文章列表</CardDescription>
      </CardHeader>
      <CardContent class="pt-0">
        <!-- 加载状态 -->
        <div v-if="loading" class="space-y-4">
          <div v-for="i in 5" :key="i" class="flex items-center justify-between gap-3 py-3 border-b">
            <div class="flex-1 space-y-2 min-w-0">
              <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
              <div class="h-3 bg-muted rounded w-1/4 animate-pulse" />
            </div>
            <div class="flex items-center gap-2 shrink-0">
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
              class="flex items-center justify-between gap-3 py-3 border-b last:border-0"
            >
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate text-sm">{{ post.title }}</p>
                <p class="text-sm text-muted-foreground">{{ formatDate(post.create_time) }}</p>
              </div>
              <div class="flex items-center gap-1 sm:gap-2 shrink-0">
                <Badge variant="outline" class="text-xs">{{ post.status || '已发布' }}</Badge>
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
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-8 sm:py-12">
          <Icon name="lucide:file-text" class="size-10 sm:size-12 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground text-sm">暂无文章</p>
          <Button variant="outline" class="mt-4" @click="createPost">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            创建第一篇文章
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 最新评论和热门文章 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <!-- 最新评论 -->
      <Card>
        <CardHeader class="space-y-1">
          <CardTitle class="text-lg sm:text-xl">最新评论</CardTitle>
          <CardDescription class="text-sm">最近收到的评论</CardDescription>
        </CardHeader>
        <CardContent class="pt-0">
          <!-- 加载状态 -->
          <div v-if="loading" class="space-y-4">
            <div v-for="i in 5" :key="i" class="py-3 border-b">
              <div class="h-4 bg-muted rounded w-3/4 animate-pulse mb-2" />
              <div class="h-3 bg-muted rounded w-1/2 animate-pulse" />
            </div>
          </div>

          <!-- 评论列表 -->
          <div v-else-if="recentComments.length > 0" class="space-y-4">
            <div
              v-for="comment in recentComments"
              :key="comment.coid"
              class="py-3 border-b last:border-0"
            >
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex-1 min-w-0">
                  <p class="font-medium truncate text-sm">{{ comment.name || '匿名' }}</p>
                  <p class="text-xs text-muted-foreground">{{ formatDateTime(comment.create_time) }}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive shrink-0"
                  @click="deleteComment(comment.coid)"
                >
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
              <p class="text-sm text-muted-foreground line-clamp-2 mb-2">{{ comment.content }}</p>
              <div v-if="comment.posts" class="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon name="lucide:file-text" class="size-3 shrink-0" />
                <span class="truncate">{{ comment.posts.title }}</span>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="text-center py-8 sm:py-12">
            <Icon name="lucide:message-square" class="size-10 sm:size-12 text-muted-foreground/30 mx-auto mb-4" />
            <p class="text-muted-foreground text-sm">暂无评论</p>
          </div>
        </CardContent>
      </Card>

      <!-- 热门文章 -->
      <Card>
        <CardHeader class="space-y-1">
          <CardTitle class="text-lg sm:text-xl">热门文章</CardTitle>
          <CardDescription class="text-sm">评论最多的文章</CardDescription>
        </CardHeader>
        <CardContent class="pt-0">
          <!-- 加载状态 -->
          <div v-if="loading" class="space-y-4">
            <div v-for="i in 5" :key="i" class="py-3 border-b">
              <div class="h-4 bg-muted rounded w-3/4 animate-pulse mb-2" />
              <div class="h-3 bg-muted rounded w-1/3 animate-pulse" />
            </div>
          </div>

          <!-- 热门文章列表 -->
          <div v-else-if="popularPosts.length > 0" class="space-y-4">
            <div
              v-for="(post, index) in popularPosts"
              :key="post.cid"
              class="flex items-start gap-3 py-3 border-b last:border-0"
            >
              <div class="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {{ index + 1 }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate cursor-pointer hover:text-primary text-sm" @click="editPost(post.cid)">{{ post.title }}</p>
                <div class="flex items-center flex-wrap gap-2 sm:gap-3 mt-1 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1">
                    <Icon name="lucide:message-circle" class="size-3" />
                    {{ post.commentsCount }} 条评论
                  </span>
                  <span class="flex items-center gap-1">
                    <Icon name="lucide:star" class="size-3" />
                    热门文章
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="text-center py-8 sm:py-12">
            <Icon name="lucide:trending-up" class="size-10 sm:size-12 text-muted-foreground/30 mx-auto mb-4" />
            <p class="text-muted-foreground text-sm">暂无热门文章</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 系统详细信息 -->
    <Card v-if="!loading" class="mt-4 sm:mt-6">
      <CardHeader class="space-y-1">
        <CardTitle class="text-lg sm:text-xl">系统信息</CardTitle>
        <CardDescription class="text-sm">服务器和应用程序运行状态</CardDescription>
      </CardHeader>
      <CardContent class="pt-0">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <!-- Node.js 信息 -->
          <div class="space-y-2 p-3 rounded-lg bg-muted/30">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Icon name="lucide:server" class="size-4 text-muted-foreground shrink-0" />
              <span class="truncate">Node.js 版本</span>
            </div>
            <p class="text-xl sm:text-2xl font-bold truncate">{{ systemInfo.nodeVersion }}</p>
            <div class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span class="truncate">{{ systemInfo.platform }}</span>
              <span class="shrink-0">•</span>
              <span class="truncate">{{ systemInfo.architecture }}</span>
            </div>
          </div>

          <!-- 数据库信息 -->
          <div class="space-y-2 p-3 rounded-lg bg-muted/30">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Icon name="lucide:database" class="size-4 text-muted-foreground shrink-0" />
              <span class="truncate">数据库版本</span>
            </div>
            <p class="text-lg sm:text-xl font-bold truncate">{{ systemInfo.database.version }}</p>
            <p class="text-xs text-muted-foreground">MySQL / MariaDB</p>
          </div>

          <!-- 附件信息 -->
          <div class="space-y-2 p-3 rounded-lg bg-muted/30">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Icon name="lucide:paperclip" class="size-4 text-muted-foreground shrink-0" />
              <span class="truncate">附件统计</span>
            </div>
            <p class="text-xl sm:text-2xl font-bold">{{ systemInfo.attachments.count }}</p>
            <p class="text-xs text-muted-foreground truncate">总大小: {{ formatFileSize(systemInfo.attachments.totalSize) }}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>
