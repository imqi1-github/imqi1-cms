<script setup lang="ts">
const links = ref<any[]>([])
const showAddModal = ref(false)
const newLink = ref({ name: '', link: '', desc: '', avatar: '' })

async function fetchLinks() {
  try {
    links.value = await $fetch('/api/admin/links') as any[]
  } catch (error) {
    console.error('获取友情链接失败:', error)
    links.value = []
  }
}

async function addLink() {
  try {
    await $fetch('/api/admin/links', {
      method: 'POST',
      body: newLink.value,
    })
    newLink.value = { name: '', link: '', desc: '', avatar: '' }
    showAddModal.value = false
    await fetchLinks()
  } catch (error) {
    console.error('添加失败:', error)
  }
}

async function toggleEnabled(link: any) {
  try {
    await $fetch(`/api/admin/links/${link.id}/toggle`, { method: 'PATCH' })
    await fetchLinks()
  } catch (error) {
    console.error('操作失败:', error)
  }
}

async function deleteLink(id: number) {
  const confirmed = confirm('确定要删除这个链接吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/links/${id}`, { method: 'DELETE' })
      await fetchLinks()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

onMounted(() => {
  fetchLinks()
})
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">友情链接</h2>
        <p class="text-sm text-muted-foreground mt-1">管理友情链接</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        添加链接
      </Button>
    </div>

    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>链接</TableHead>
            <TableHead>描述</TableHead>
            <TableHead>状态</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="link in links" :key="link.id">
            <TableCell>
              <div class="flex items-center gap-3">
                <Avatar class="size-8">
                  <AvatarImage v-if="link.avatar" :src="link.avatar" />
                  <AvatarFallback>{{ link.name?.charAt(0) || '?' }}</AvatarFallback>
                </Avatar>
                <span class="font-medium">{{ link.name }}</span>
              </div>
            </TableCell>
            <TableCell>
              <a :href="link.link" target="_blank" class="text-primary hover:underline truncate block max-w-[200px]">
                {{ link.link }}
              </a>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ link.desc || '-' }}</TableCell>
            <TableCell>
              <Badge :variant="link.enabled ? 'default' : 'secondary'">
                {{ link.enabled ? '启用' : '禁用' }}
              </Badge>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  @click="toggleEnabled(link)"
                >
                  {{ link.enabled ? '禁用' : '启用' }}
                </Button>
                <Button variant="ghost" size="icon" class="size-8">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  @click="deleteLink(link.id)"
                >
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div v-if="links.length === 0" class="text-center py-12">
        <Icon name="lucide:link" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无友情链接</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          添加第一个链接
        </Button>
      </div>
    </Card>

    <!-- 添加链接弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加友情链接</DialogTitle>
          <DialogDescription>添加一个新的友情链接</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addLink">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="linkName">名称</Label>
              <Input id="linkName" v-model="newLink.name" placeholder="网站名称" required />
            </div>
            <div class="space-y-2">
              <Label for="linkUrl">链接</Label>
              <Input id="linkUrl" v-model="newLink.link" type="url" placeholder="https://example.com" required />
            </div>
            <div class="space-y-2">
              <Label for="linkDesc">描述</Label>
              <Input id="linkDesc" v-model="newLink.desc" placeholder="网站描述" />
            </div>
            <div class="space-y-2">
              <Label for="linkAvatar">头像 URL</Label>
              <Input id="linkAvatar" v-model="newLink.avatar" type="url" placeholder="https://example.com/avatar.png" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showAddModal = false">
              取消
            </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
