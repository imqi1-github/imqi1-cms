<script setup lang="ts">
const loading = ref(true)
const categories = ref<any[]>([])
const showAddModal = ref(false)
const newCategory = ref({ name: '', desc: '', class: '' })

async function fetchCategories() {
  loading.value = true
  try {
    categories.value = await $fetch('/api/admin/categories') as any[]
  } catch (error) {
    console.error('获取分类失败:', error)
    categories.value = []
  } finally {
    loading.value = false
  }
}

async function addCategory() {
  try {
    await $fetch('/api/admin/categories', {
      method: 'POST',
      body: newCategory.value,
    })
    newCategory.value = { name: '', desc: '', class: '' }
    showAddModal.value = false
    await fetchCategories()
  } catch (error) {
    console.error('添加失败:', error)
  }
}

async function deleteCategory(mid: number) {
  const confirmed = confirm('确定要删除这个分类吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/categories/${mid}`, { method: 'DELETE' })
      await fetchCategories()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

onMounted(() => {
  fetchCategories()
})
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">分类管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理文章分类</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建分类
      </Button>
    </div>

    <Card>
      <!-- 加载状态 -->
      <div v-if="loading" class="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>类型</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="i in 5" :key="i">
              <TableCell>
                <div class="h-4 bg-muted rounded w-24 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-48 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-6 bg-muted rounded w-16 animate-pulse" />
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
            <TableHead>名称</TableHead>
            <TableHead>描述</TableHead>
            <TableHead>类型</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="category in categories" :key="category.mid">
            <TableCell class="font-medium">{{ category.name }}</TableCell>
            <TableCell class="text-muted-foreground">{{ category.desc || '-' }}</TableCell>
            <TableCell>
              <Badge variant="outline">{{ category.class || '默认' }}</Badge>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  @click="deleteCategory(category.mid)"
                >
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 空状态 -->
      <div v-if="!loading && categories.length === 0" class="text-center py-12">
        <Icon name="lucide:folder" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无分类</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一个分类
        </Button>
      </div>
    </Card>

    <!-- 添加分类弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建分类</DialogTitle>
          <DialogDescription>创建一个新的文章分类</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addCategory">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="name">名称</Label>
              <Input id="name" v-model="newCategory.name" placeholder="分类名称" required />
            </div>
            <div class="space-y-2">
              <Label for="desc">描述</Label>
              <Textarea id="desc" v-model="newCategory.desc" placeholder="分类描述" rows="3" />
            </div>
            <div class="space-y-2">
              <Label for="class">类型</Label>
              <Input id="class" v-model="newCategory.class" placeholder="分类类型" />
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
