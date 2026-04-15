<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/40">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>请输入账号密码</CardDescription>
      </CardHeader>

      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="username">用户名</Label>
          <Input id="username" v-model="form.username" placeholder="请输入用户名" />
        </div>

        <div class="space-y-2">
          <Label for="password">密码</Label>
          <Input
            id="password"
            type="password"
            v-model="form.password"
            placeholder="请输入密码"
            @keyup.enter="handleLogin"
          />
        </div>

        <Button class="w-full" @click="handleLogin" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
// 获取目标跳转地址
const route = useRoute()
const redirectTo = computed(() => route.query.to as string || '/admin')

const toast = useToast()

const form = reactive({
  username: '',
  password: '',
})

const loading = ref(false)
const csrfToken = ref('')

// 在组件挂载时获取 CSRF token 并检查登录状态
onMounted(async () => {
  // 检查是否已经登录
  try {
    const verifyRes = await $fetch('/api/auth/verify')
    if ((verifyRes as any).valid) {
      // 已经登录，跳转到后台
      await navigateTo(redirectTo.value)
      return
    }
  } catch {
    // 未登录，继续获取 CSRF token
  }

  // 获取 CSRF token
  try {
    const csrfRes = await $fetch('/api/csrf/token')
    if (csrfRes && (csrfRes as any).data?.token) {
      csrfToken.value = (csrfRes as any).data.token
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
    console.log('开始登录，发送请求到 /api/auth/login')
    const res: any = await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        ...form,
        csrfToken: csrfToken.value,
      },
    })

    console.log('登录响应:', res)

    // 登录成功，显示欢迎消息
    toast.success({
      message: `欢迎回来，${res.user?.name || '管理员'}！`,
      description: '登录成功，正在跳转...',
    })

    console.log('准备跳转到:', redirectTo.value)

    // 延迟跳转，让用户看到 toast
    await new Promise(resolve => setTimeout(resolve, 500))

    console.log('开始跳转')
    // 使用 window.location.href 而不是 navigateTo，确保服务器端渲染时能读取到 cookie
    window.location.href = redirectTo.value
  } catch (e: any) {
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
