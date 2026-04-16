<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()
const userId = route.params.id as string

const loading = ref(true)
const saving = ref(false)
const user = ref<any>(null)
const csrfToken = ref('')

// 表单数据
const formData = ref({
  name: '',
  nickname: '',
  mail: '',
  password: '',
  avatar: '',
  role: 0,
})

// 获取用户详情和CSRF token
async function fetchUser() {
  loading.value = true
  try {
    // 获取 CSRF token
    const csrfRes = await $fetch('/api/csrf/token', { credentials: 'include' })
    if (csrfRes && (csrfRes as any).data?.token) {
      csrfToken.value = (csrfRes as any).data.token
    }

    const data = await $fetch(`/api/admin/users/${userId}`)
    user.value = data
    formData.value = {
      name: data.name,
      nickname: data.nickname || '',
      mail: data.mail,
      password: '',
      avatar: data.avatar || '',
      role: data.role,
    }
  } catch (error: any) {
    console.error('获取用户失败:', error)
    toast.error({
      message: '获取用户失败',
      description: error?.data?.message || '请稍后重试',
    })
  } finally {
    loading.value = false
  }
}

// 保存用户
async function saveUser() {
  saving.value = true
  try {
    await $fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: {
        csrfToken: csrfToken.value,
        name: formData.value.name,
        nickname: formData.value.nickname || undefined,
        mail: formData.value.mail,
        password: formData.value.password || undefined,
        avatar: formData.value.avatar || undefined,
        role: formData.value.role,
      },
    })
    toast.success({ message: '用户更新成功' })
    router.push('/admin/users')
  } catch (error: any) {
    console.error('更新失败:', error)
    toast.error({
      message: '更新失败',
      description: error?.data?.message || '请稍后重试',
    })
  } finally {
    saving.value = false
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  fetchUser()
})
</script>

<template>
  <AdminLayout>
    <div class="flex items-center gap-4 mb-6">
      <Button variant="ghost" size="icon" @click="router.push('/admin/users')">
        <Icon name="lucide:arrow-left" class="size-4" />
      </Button>
      <div>
        <h2 class="text-2xl font-bold">编辑用户</h2>
        <p class="text-sm text-muted-foreground mt-1">修改用户信息和权限</p>
      </div>
    </div>

    <Card v-if="!loading && user">
      <form @submit.prevent="saveUser">
        <div class="space-y-6 p-6">
          <!-- 头像区域 -->
          <div class="flex items-center gap-6">
            <Avatar class="size-20">
              <AvatarImage v-if="user.avatar" :src="user.avatar" />
              <AvatarFallback class="text-lg">
                {{ user.name?.charAt(0)?.toUpperCase() || '?' }}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 class="text-lg font-semibold">{{ user.name }}</h3>
              <p class="text-sm text-muted-foreground">用户ID: {{ user.uid }}</p>
              <p class="text-sm text-muted-foreground">注册时间: {{ formatDate(user.create) }}</p>
            </div>
          </div>

          <Separator />

          <!-- 表单字段 -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- 用户名 -->
            <div class="space-y-2">
              <Label for="userName">用户名 <span class="text-destructive">*</span></Label>
              <Input
                id="userName"
                v-model="formData.name"
                placeholder="用户名"
                required
              />
            </div>

            <!-- 昵称 -->
            <div class="space-y-2">
              <Label for="userNickname">昵称</Label>
              <Input
                id="userNickname"
                v-model="formData.nickname"
                placeholder="显示名称"
              />
              <p class="text-xs text-muted-foreground">留空则使用用户名</p>
            </div>

            <!-- 邮箱 -->
            <div class="space-y-2">
              <Label for="userMail">邮箱 <span class="text-destructive">*</span></Label>
              <Input
                id="userMail"
                v-model="formData.mail"
                type="email"
                placeholder="邮箱地址"
                required
              />
            </div>

            <!-- 头像URL -->
            <div class="space-y-2">
              <Label for="userAvatar">头像 URL</Label>
              <Input
                id="userAvatar"
                v-model="formData.avatar"
                placeholder="头像图片地址"
              />
              <p class="text-xs text-muted-foreground">留空则使用默认头像</p>
            </div>

            <!-- 角色 -->
            <div class="space-y-2">
              <Label for="userRole">角色</Label>
              <Select v-model="formData.role">
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

          <!-- 密码 -->
          <div class="space-y-2">
            <Label for="userPassword">新密码</Label>
            <Input
              id="userPassword"
              v-model="formData.password"
              type="password"
              placeholder="留空则不修改密码"
            />
            <p class="text-xs text-muted-foreground">如需修改密码请输入新密码，否则留空</p>
          </div>

          <Separator />

          <!-- 操作按钮 -->
          <div class="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              @click="router.push('/admin/users')"
            >
              取消
            </Button>
            <Button type="submit" :disabled="saving">
              <Icon
                v-if="saving"
                name="lucide:loader-2"
                class="mr-2 size-4 animate-spin"
              />
              {{ saving ? '保存中...' : '保存' }}
            </Button>
          </div>
        </div>
      </form>
    </Card>

    <!-- 加载状态 -->
    <Card v-else class="p-12">
      <div class="flex flex-col items-center justify-center gap-4">
        <div class="size-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p class="text-muted-foreground">加载中...</p>
      </div>
    </Card>
  </AdminLayout>
</template>
