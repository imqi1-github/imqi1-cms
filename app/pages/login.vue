<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/40">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>登录</CardTitle>
      </CardHeader>

      <CardContent class="space-y-4">
        <!-- 无管理员账户提示 -->
        <div
          v-if="!hasUser"
          class="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
          <Icon name="ri:information-line" class="size-4 shrink-0 mt-0.5" />
          <div class="space-y-1">
            <p class="font-medium">尚未创建管理员账户</p>
            <p>开发环境运行 <code class="rounded bg-amber-100 px-1 dark:bg-amber-900">bun run db:init</code>，生产环境执行 <code class="rounded bg-amber-100 px-1 dark:bg-amber-900">scripts/init-db.sql</code> 创建管理员后即可登录。</p>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="username">用户名</Label>
          <Input id="username" v-model="form.username" placeholder="请输入用户名" />
        </div>

        <div class="space-y-2">
          <Label for="password">密码</Label>
          <Input
            id="password"
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            @keyup.enter="handleLogin"
          />
        </div>

        <Button class="w-full" :disabled="loading" @click="handleLogin">
          {{ loading ? '登录中...' : '登录' }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
// 获取目标跳转地址
import type {ApiError} from "~/types/apis/login";
import type {AuthVerifyResponse} from "~/types/apis/auth";

const route = useRoute()
const redirectTo = computed(() => {
  const to = route.query.to
  // 仅允许站内绝对路径，避免开放重定向（拒绝 //evil.com、/\evil.com、外链等）
  if (typeof to === 'string' && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\')) {
    return to
  }
  return '/admin'
})

const toast = useToast()

const form = reactive({
  username: '',
  password: '',
})

const loading = ref(false)
const csrfToken = ref('')
const hasUser = ref(true)

onMounted(async () => {
  // 检查是否已经登录
  try {
    const verifyRes = await $fetch<AuthVerifyResponse>('/api/auth/verify')
    if (verifyRes.valid) {
      // 已经登录，跳转到后台
      await navigateTo(redirectTo.value)
      return
    }
    // 未登录：从 verify 响应取系统初始化状态（原 /api/auth/status 已并入此处）
    hasUser.value = verifyRes.hasUser
  } catch {
    // verify 异常时保持默认 hasUser=true（不显示初始化提示），继续获取 CSRF token
  }

  // 获取 CSRF token
  try {
    const csrfRes = await $fetch('/api/csrf/token')
    if (csrfRes?.data?.token) {
      csrfToken.value = csrfRes.data.token
    }
  } catch (error) {
    console.error('获取 CSRF token 失败:', error)
  }
})

const handleLogin = async () => {
  if (!form.username || !form.password) {
    toast.error({ message: '请填写完整信息' })
    return
  }

  if (!csrfToken.value) {
    toast.error({ message: 'CSRF token 未加载，请刷新页面' })
    return
  }

  loading.value = true

  try {
    const res = await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        ...form,
        csrfToken: csrfToken.value,
      },
    })

    // 登录成功，显示欢迎消息
    toast.success({
      message: `欢迎回来，${res.user?.nickname || res.user?.name || '管理员'}！`,
      description: '登录成功，正在跳转...',
    })

    // 延迟跳转，让用户看到 toast
    await new Promise(resolve => setTimeout(resolve, 500))

    await navigateTo(redirectTo.value)

  } catch (rawError: unknown) {
    const e = rawError as ApiError;
    toast.error({
      message: '登录失败',
      description: e?.data?.message || '请检查用户名和密码',
    })
  } finally {
    loading.value = false
  }
}

useHead({
  title: "登录后台 - 后台管理"
})
</script>
