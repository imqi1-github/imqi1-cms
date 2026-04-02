<script setup lang="ts">
const comments = ref<any[]>([])
const postsMap = ref<Map<number, string>>(new Map())

async function fetchComments() {
  try {
    const data = await $fetch('/api/admin/comments') as any[]
    comments.value = data

    const posts = await $fetch('/api/admin/posts') as any[]
    postsMap.value = new Map(posts.map(p => [p.cid, p.title]))
  } catch (error) {
    console.error('获取评论失败:', error)
    comments.value = []
  }
}

async function approveComment(coid: number) {
  try {
    await $fetch(`/api/admin/comments/${coid}`, {
      method: 'PATCH',
      body: { status: 1 },
    })
    await fetchComments()
  } catch (error) {
    console.error('操作失败:', error)
  }
}

async function deleteComment(coid: number) {
  const confirmed = confirm('确定要删除这条评论吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/comments/${coid}`, { method: 'DELETE' })
      await fetchComments()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

function getPostTitle(cid: number) {
  return postsMap.value.get(cid) || '未知'
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

function getStatusBadge(status: number) {
  return status === 1
    ? { label: '已审核', variant: 'default' as const }
    : { label: '待审核', variant: 'secondary' as const }
}

onMounted(() => {
  fetchComments()
})
</script>

<template>
  <AdminLayout>
    <div class="mb-6">
      <h2 class="text-2xl font-bold">评论管理</h2>
      <p class="text-sm text-muted-foreground mt-1">审核和管理用户评论</p>
    </div>

    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>评论者</TableHead>
            <TableHead>内容</TableHead>
            <TableHead>文章</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>时间</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="comment in comments" :key="comment.coid">
            <TableCell>
              <div class="flex items-center gap-3">
                <Avatar class="size-8">
                  <AvatarFallback>{{ comment.name?.charAt(0) || '?' }}</AvatarFallback>
                </Avatar>
                <div>
                  <p class="font-medium">{{ comment.name }}</p>
                  <p class="text-sm text-muted-foreground">{{ comment.mail }}</p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <p class="max-w-md truncate">{{ comment.content }}</p>
            </TableCell>
            <TableCell>{{ getPostTitle(comment.cid) }}</TableCell>
            <TableCell>
              <Badge :variant="getStatusBadge(comment.status).variant">
                {{ getStatusBadge(comment.status).label }}
              </Badge>
            </TableCell>
            <TableCell>{{ formatDate(comment.create_time) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button
                  v-if="comment.status !== 1"
                  variant="outline"
                  size="sm"
                  @click="approveComment(comment.coid)"
                >
                  <Icon name="lucide:check" class="mr-1 size-4" />
                  通过
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  @click="deleteComment(comment.coid)"
                >
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div v-if="comments.length === 0" class="text-center py-12">
        <Icon name="lucide:message-square" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无评论</p>
      </div>
    </Card>
  </AdminLayout>
</template>
