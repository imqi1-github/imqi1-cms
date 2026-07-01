<script setup lang="ts">
import type {CurrentUser, UserDetail} from "~/types/apis/admin/users";
import type {ApiError} from "~/types/error";

const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const user = ref<UserDetail | null>(null)
const csrfToken = ref('')

// 表单数据
const formData = ref({
  name: '',
  nickname: '',
  mail: '',
  password: '',
  avatar: '',
})

// 获取当前账户详情和 CSRF token
async function fetchUser() {
  loading.value = true
  try {
    // 获取 CSRF token
    const csrfRes = await $fetch('/api/csrf/token', { credentials: 'include' })
    if (csrfRes?.data?.token) {
      csrfToken.value = csrfRes.data.token
    }

    // 单用户：当前登录账户即要编辑的账户
    const me = await $fetch<CurrentUser>('/api/auth/me')
    const data = await $fetch<UserDetail>(`/api/admin/users/${me.uid}`)
    user.value = data
    formData.value = {
      name: data.name,
      nickname: data.nickname || '',
      mail: data.mail,
      password: '',
      avatar: data.avatar || '',
    }
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    console.error('获取账户失败:', error)
    toast.error({
      message: '获取账户失败',
      description: error?.data?.message || '请稍后重试',
    })
  } finally {
    loading.value = false
  }
}

// 保存账户
async function saveUser() {
  saving.value = true
  try {
    if (!user.value) return
    await $fetch(`/api/admin/users/${user.value.uid}`, {
      method: 'PUT',
      body: {
        csrfToken: csrfToken.value,
        name: formData.value.name,
        nickname: formData.value.nickname || undefined,
        mail: formData.value.mail,
        password: formData.value.password || undefined,
        avatar: formData.value.avatar || undefined,
      },
    })
    toast.success({ message: '账户更新成功' })
    // 留在本页，刷新数据
    await fetchUser()
  } catch (rawError: unknown) {
    const error = rawError as ApiError
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
    <div class="mb-6">
      <h2 class="text-2xl font-bold">账户设置</h2>
      <p class="text-sm text-muted-foreground mt-1">管理当前账户信息和密码</p>
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
              <p class="text-sm text-muted-foreground">注册时间: {{ formatDate(user.create_time) }}</p>
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
