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

        <p v-if="error" class="text-sm text-red-500">
          {{ error }}
        </p>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
// 获取目标跳转地址
const route = useRoute()
const redirectTo = computed(() => route.query.to as string || '/admin')

const form = reactive({
  username: '',
  password: '',
})

const loading = ref(false)
const error = ref('')

const handleLogin = async () => {
  error.value = ''

  if (!form.username || !form.password) {
    error.value = '请填写完整信息'
    return
  }

  loading.value = true

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: form,
    })

    // 登录成功，跳转到目标页面
    await navigateTo(redirectTo.value)
  } catch (e: any) {
    error.value = e?.data?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
