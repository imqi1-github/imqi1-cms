<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/40">
    <Card class="w-95">
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

// 如果已登录，跳转到 admin（避免 SSR 水合不匹配）
onMounted(async () => {
  const sessionCookie = useCookie('session')
  if (sessionCookie.value) {
    try {
      const res = await $fetch('/api/auth/verify')
      if ((res as any).valid) {
        await navigateTo(redirectTo.value)
      }
    } catch {
      // 忽略错误，继续显示登录页
    }
  }
})

const form = reactive({
  username: '',
  password: '',
})

const loading = ref(false)

const handleLogin = async () => {
  if (!form.username || !form.password) {
    toast.error({ message: '请填写完整信息' })
    return
  }

  loading.value = true

  try {
    const res: any = await $fetch('/api/auth/login', {
      method: 'POST',
      body: form,
    })

    // 登录成功，显示欢迎消息
    toast.success({
      message: `欢迎回来，${res.user?.name || '管理员'}！`,
      description: '登录成功，正在跳转...',
    })

    // 延迟跳转，让用户看到 toast
    await new Promise(resolve => setTimeout(resolve, 500))
    await navigateTo(redirectTo.value)
  } catch (e: any) {
    toast.error({
      message: '登录失败',
      description: e?.data?.message || '请检查用户名和密码',
    })
  } finally {
    loading.value = false
  }
}
</script>
