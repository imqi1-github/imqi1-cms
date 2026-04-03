<script setup lang="ts">
const loading = ref(true)
const users = ref<any[]>([])
const showAddModal = ref(false)
const newUser = ref({ name: '', mail: '', password: '', role: 0 })

async function fetchUsers() {
  loading.value = true
  try {
    users.value = await $fetch('/api/admin/users') as any[]
  } catch (error) {
    console.error('获取用户失败:', error)
    users.value = []
  } finally {
    loading.value = false
  }
}

async function addUser() {
  try {
    await $fetch('/api/admin/users', {
      method: 'POST',
      body: newUser.value,
    })
    newUser.value = { name: '', mail: '', password: '', role: 0 }
    showAddModal.value = false
    await fetchUsers()
  } catch (error) {
    console.error('添加失败:', error)
  }
}

async function deleteUser(id: number) {
  const confirmed = confirm('确定要删除这个用户吗？')
  if (confirmed) {
    try {
      await $fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      await fetchUsers()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

function getRoleBadge(role: number) {
  return role === 1
    ? { label: '管理员', variant: 'default' as const }
    : { label: '普通用户', variant: 'secondary' as const }
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">用户管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理系统用户</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建用户
      </Button>
    </div>

    <Card>
      <!-- 加载状态 -->
      <div v-if="loading" class="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="i in 5" :key="i">
              <TableCell>
                <div class="flex items-center gap-3">
                  <div class="size-8 bg-muted rounded-full animate-pulse" />
                  <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                </div>
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-36 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-6 bg-muted rounded w-16 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-24 animate-pulse" />
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
            <TableHead>用户名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="user in users" :key="user.id">
            <TableCell>
              <div class="flex items-center gap-3">
                <Avatar class="size-8">
                  <AvatarFallback>{{ user.name?.charAt(0)?.toUpperCase() || '?' }}</AvatarFallback>
                </Avatar>
                <span class="font-medium">{{ user.name }}</span>
              </div>
            </TableCell>
            <TableCell>{{ user.mail }}</TableCell>
            <TableCell>
              <Badge :variant="getRoleBadge(user.role).variant">
                {{ getRoleBadge(user.role).label }}
              </Badge>
            </TableCell>
            <TableCell>{{ formatDate(user.create) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  @click="deleteUser(user.id)"
                >
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 空状态 -->
      <div v-if="!loading && users.length === 0" class="text-center py-12">
        <Icon name="lucide:users" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无用户</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一个用户
        </Button>
      </div>
    </Card>

    <!-- 添加用户弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建用户</DialogTitle>
          <DialogDescription>创建一个新的系统用户</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addUser">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="userName">用户名</Label>
              <Input id="userName" v-model="newUser.name" placeholder="用户名" required />
            </div>
            <div class="space-y-2">
              <Label for="userMail">邮箱</Label>
              <Input id="userMail" v-model="newUser.mail" type="email" placeholder="邮箱地址" required />
            </div>
            <div class="space-y-2">
              <Label for="userPassword">密码</Label>
              <Input id="userPassword" v-model="newUser.password" type="password" placeholder="密码" required />
            </div>
            <div class="space-y-2">
              <Label for="userRole">角色</Label>
              <Select v-model="newUser.role">
                <SelectTrigger id="userRole">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="0">普通用户</SelectItem>
                  <SelectItem :value="1">管理员</SelectItem>
                </SelectContent>
              </Select>
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
