<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/40">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>{{ challenge ? '两步验证' : '登录' }}</CardTitle>
      </CardHeader>

      <CardContent class="space-y-4">
        <!-- 无管理员账户提示 -->
        <div
          v-if="!hasUser && !challenge"
          class="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
          <Icon name="ri:information-line" class="size-4 shrink-0 mt-0.5" />
          <div class="space-y-1">
            <p class="font-medium">尚未创建管理员账户</p>
            <p>开发环境运行 <code class="rounded bg-amber-100 px-1 dark:bg-amber-900">bun run db:init</code>，生产环境执行 <code class="rounded bg-amber-100 px-1 dark:bg-amber-900">scripts/init-db.sql</code> 创建管理员后即可登录。</p>
          </div>
        </div>

        <!-- ========== 第一步：用户名/密码（+自适应验证码） ========== -->
        <template v-if="!challenge">
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

          <!-- 自适应图形验证码：平时隐藏，IP 有过失败后出现 -->
          <div v-if="captchaRequired" class="space-y-2">
            <Label for="captcha">验证码</Label>
            <div class="flex items-center gap-2">
              <Input
                id="captcha"
                v-model="form.captcha"
                placeholder="输入图中字符"
                class="flex-1"
                @keyup.enter="handleLogin"
              />
              <img
                v-if="captchaUrl"
                :src="captchaUrl"
                alt="验证码"
                class="h-9 w-27.5 shrink-0 cursor-pointer rounded-md border"
                title="点击刷新"
                @click="loadCaptcha"
              >
            </div>
          </div>

          <Button class="w-full" :disabled="loading" @click="handleLogin">
            {{ loading ? '登录中...' : '登录' }}
          </Button>
        </template>

        <!-- ========== 第二步：TOTP 动态码（密码已过、需第二因素） ========== -->
        <template v-else>
          <p class="text-sm text-muted-foreground">
            请在认证器应用（如 Google Authenticator、Authy、1Password）中输入当前 6 位动态验证码。
          </p>

          <div class="space-y-2">
            <Label for="totpCode">动态验证码</Label>
            <Input
              id="totpCode"
              v-model="totpCode"
              inputmode="numeric"
              maxlength="6"
              placeholder="6 位数字"
              @keyup.enter="handleVerify2FA"
            />
          </div>

          <div class="flex items-center gap-2">
            <Checkbox
              id="rememberDevice"
              :model-value="rememberDevice"
              @update:model-value="rememberDevice = $event === true"
            />
            <Label for="rememberDevice" class="cursor-pointer">信任此设备 30 天</Label>
          </div>

          <Button class="w-full" :disabled="loading2FA" @click="handleVerify2FA">
            {{ loading2FA ? '验证中...' : '确认登录' }}
          </Button>
        </template>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
// 获取目标跳转地址
import type { ApiError } from "~/types/error";
import type {
  AuthVerifyResponse,
  LoginResponse,
  LoginConfigResponse,
} from "~/types/apis/auth";

const route = useRoute()
const redirectTo = computed(() => {
  const to = route.query.to
  // 仅允许站内绝对路径，避免开放重定向（拒绝 //evil.com、/\evil.com、外链等）。
  // 追加字符白名单：拒绝控制字符（%00 等）、空白、反斜杠，防浏览器规范化差异绕过（如 "/\evil.com"、含 \n\t 的 payload）
  if (
    typeof to === 'string' &&
    /^\/[a-zA-Z0-9/?#&=_%.\-:@~]+$/.test(to) &&
    !to.startsWith('//') &&
    !to.includes('\\')
  ) {
    return to
  }
  return '/admin'
})

const toast = useToast()

const form = reactive({
  username: '',
  password: '',
  captcha: '',
})

const loading = ref(false)
const csrfToken = ref('')
const hasUser = ref(true)

// 自适应验证码
const captchaRequired = ref(false)
const captchaUrl = ref('')

// 2FA
const challenge = ref('')
const totpCode = ref('')
const rememberDevice = ref(false)
const loading2FA = ref(false)

async function loadCaptcha() {
  captchaUrl.value = `/api/captcha/image?t=${Date.now()}`
  form.captcha = ''
}

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

  // 自适应验证码：该 IP 被撞过才要求
  try {
    const cfg = await $fetch<LoginConfigResponse>('/api/auth/login-config')
    if (cfg.captchaRequired) {
      captchaRequired.value = true
      await loadCaptcha()
    }
  } catch {
    // 探测失败时保持当前状态（无验证码），不阻断登录
  }
})

const handleLogin = async () => {
  // 重入守卫：密码框 @keyup.enter 不随 loading 禁用，点击后请求进行中再按 Enter 会重复发 POST
  if (loading.value) return

  if (!form.username || !form.password) {
    toast.error({ message: '请填写完整信息' })
    return
  }
  if (captchaRequired.value && !form.captcha) {
    toast.error({ message: '请填写验证码' })
    return
  }

  if (!csrfToken.value) {
    toast.error({ message: 'CSRF token 未加载，请刷新页面' })
    return
  }

  loading.value = true

  try {
    const res = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: {
        username: form.username,
        password: form.password,
        csrfToken: csrfToken.value,
        // 未要求验证码时传空串，服务端不校验；要求时必填
        captcha: form.captcha,
      },
    })

    if (!res.success) {
      // 密码正确但需要第二因素：切换到动态码步骤
      challenge.value = res.challenge
      totpCode.value = ''
      rememberDevice.value = false
      return
    }

    // 登录成功
    toast.success({
      message: `欢迎回来，${res.user.nickname || res.user.name || '管理员'}！`,
      description: '登录成功，正在跳转...',
    })
    await new Promise(resolve => setTimeout(resolve, 500))
    await navigateTo(redirectTo.value)
  } catch (rawError: unknown) {
    const e = rawError as ApiError
    // 验证码被要求/错误：显示验证码并刷新
    if (e?.data?.captchaRequired) {
      captchaRequired.value = true
      await loadCaptcha()
      toast.error({ message: '请填写正确验证码' })
    } else {
      toast.error({
        message: '登录失败',
        description: e?.data?.message || '请检查用户名和密码',
      })
      // 失败后该 IP 进入验证码模式，刷新一次配置
      try {
        const cfg = await $fetch<LoginConfigResponse>('/api/auth/login-config')
        if (cfg.captchaRequired && !captchaRequired.value) {
          captchaRequired.value = true
          await loadCaptcha()
        }
      } catch {
        // 忽略
      }
    }
  } finally {
    loading.value = false
  }
}

const handleVerify2FA = async () => {
  if (loading2FA.value) return
  if (!challenge.value) return
  if (!/^\d{6}$/.test(totpCode.value.trim())) {
    toast.error({ message: '请输入 6 位动态验证码' })
    return
  }

  loading2FA.value = true
  try {
    const res = await $fetch<Extract<LoginResponse, { success: true }>>('/api/auth/2fa/verify', {
      method: 'POST',
      body: {
        challenge: challenge.value,
        code: totpCode.value.trim(),
        rememberDevice: rememberDevice.value,
      },
    })

    toast.success({
      message: `欢迎回来，${res.user.nickname || res.user.name || '管理员'}！`,
      description: '登录成功，正在跳转...',
    })
    await new Promise(resolve => setTimeout(resolve, 500))
    await navigateTo(redirectTo.value)
  } catch (rawError: unknown) {
    const e = rawError as ApiError
    toast.error({
      message: '验证失败',
      description: e?.data?.message || '请重新输入动态验证码',
    })
    // challenge 过期等情况回退到第一步
    if (e?.data?.message?.includes('过期')) {
      challenge.value = ''
    }
  } finally {
    loading2FA.value = false
  }
}

useHead({
  title: "登录后台 - 后台管理"
})
</script>
