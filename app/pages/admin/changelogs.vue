<script setup lang="ts">
const changelogs = ref<any[]>([])
const loading = ref(false)
const showAddModal = ref(false)

const newChangelog = ref({ class: 'feature', desc: '' })

const typeOptions = [
  { value: 'feature', label: '新功能', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  { value: 'improvement', label: '优化', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  { value: 'fix', label: '修复', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
]

// 加载更新日志
async function loadChangelogs() {
  loading.value = true
  try {
    changelogs.value = await $fetch('/api/admin/changelogs') as any[]
  } catch (error) {
    console.error('获取更新日志失败:', error)
    changelogs.value = []
  } finally {
    loading.value = false
  }
}

async function addChangelog() {
  try {
    await $fetch('/api/admin/changelogs', {
      method: 'POST',
      body: newChangelog.value,
    })
    newChangelog.value = { class: 'feature', desc: '' }
    showAddModal.value = false
    await loadChangelogs()
  } catch (error) {
    console.error('添加失败:', error)
  }
}

async function deleteChangelog(id: number) {
  const confirmed = confirm('确定要删除这条日志吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/changelogs/${id}`, { method: 'DELETE' })
      await loadChangelogs()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

function getTypeLabel(type: string) {
  return typeOptions.find(t => t.value === type)?.label || type
}

function getTypeColor(type: string) {
  return typeOptions.find(t => t.value === type)?.color || ''
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  loadChangelogs()
})
</script>

<template>
  <AdminLayout>
    <div class="mb-6">
      <h2 class="text-2xl font-bold">更新日志</h2>
      <p class="text-sm text-muted-foreground mt-1">记录系统更新历史</p>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>更新历史</CardTitle>
            <CardDescription>查看和管理系统更新记录</CardDescription>
          </div>
          <Button @click="showAddModal = true">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            添加日志
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <!-- 加载状态 -->
        <div v-if="loading" class="text-center py-8">
          <Icon name="lucide:loader-2" class="size-8 animate-spin mx-auto text-muted-foreground" />
          <p class="text-sm text-muted-foreground mt-2">加载中...</p>
        </div>

        <!-- 日志列表 -->
        <div v-else-if="changelogs.length > 0" class="space-y-4">
          <div
            v-for="log in changelogs"
            :key="log.id"
            class="group flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <Badge :class="getTypeColor(log.class)">
                  {{ getTypeLabel(log.class) }}
                </Badge>
                <span class="text-sm text-muted-foreground">{{ formatDate(log.create_time) }}</span>
              </div>
              <p class="text-foreground">{{ log.desc }}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="size-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              @click="deleteChangelog(log.id)"
            >
              <Icon name="lucide:trash-2" class="size-4" />
            </Button>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-16">
          <Icon name="lucide:file-text" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground">暂无更新日志</p>
          <Button variant="outline" class="mt-4" @click="showAddModal = true">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            添加第一条日志
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 添加日志弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加更新日志</DialogTitle>
          <DialogDescription>记录一次系统更新</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addChangelog">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="logClass">类型</Label>
              <Select v-model="newChangelog.class">
                <SelectTrigger id="logClass">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in typeOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="logDesc">描述</Label>
              <Textarea
                id="logDesc"
                v-model="newChangelog.desc"
                placeholder="更新内容描述"
                rows="4"
                required
              />
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
