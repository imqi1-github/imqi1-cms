<script setup lang="ts">
import type {CurrentUser, UserDetail} from "~/types/apis/admin/users";
import type {ApiError} from "~/types/error";
import type {
  TwoFactorStatusResponse,
  TwoFactorSetupResponse,
  TrustedDevicesResponse,
  TrustedDevice,
} from "~/types/apis/auth";

const toast = useToast()

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const user = ref<UserDetail | null>(null)
const csrfToken = ref('')

// 两步验证
const twoFactor = ref<TwoFactorStatusResponse>({ enabled: false, pendingSetup: false })
const twoFASetup = reactive({ secret: '', otpauthUrl: '', qrDataUrl: '' })
const twoFACode = ref('')
const twoFABusy = ref(false)

// 已信任设备（后台可列/撤/改名）
const trustedDevices = ref<TrustedDevice[]>([])
const devicesBusy = ref<number | null>(null)
const renamingId = ref<number | null>(null)
const editingName = ref('')

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
    loadError.value = ''
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
    loadError.value = error?.data?.message || '加载失败，请稍后重试'
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
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
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

// ===== 两步验证 =====
async function fetchTwoFactorStatus() {
  try {
    const res = await $fetch<TwoFactorStatusResponse>('/api/auth/2fa/status')
    twoFactor.value = res
    if (!res.enabled) {
      // 无启用中的密钥，重置已展示的 setup 状态
      twoFASetup.secret = ''
      twoFASetup.otpauthUrl = ''
      twoFASetup.qrDataUrl = ''
    }
  } catch {
    // 状态获取失败不阻断页面
  }
}

// 开始启用：生成密钥，展示 secret + otpauth 串
async function enable2FA() {
  if (!csrfToken.value) {
    toast.error({ message: '会话已失效，请刷新页面后重试' })
    return
  }
  twoFABusy.value = true
  try {
    const res = await $fetch<TwoFactorSetupResponse>('/api/auth/2fa/setup', {
      method: 'POST',
      body: { csrfToken: csrfToken.value },
    })
    twoFASetup.secret = res.secret
    twoFASetup.otpauthUrl = res.otpauthUrl
    twoFASetup.qrDataUrl = res.qrDataUrl
    twoFactor.value = { enabled: false, pendingSetup: true }
    twoFACode.value = ''
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    toast.error({ message: '启用失败', description: error?.data?.message || '请稍后重试' })
  } finally {
    twoFABusy.value = false
  }
}

// 确认启用：用当前动态码验证
async function confirmEnable() {
  if (!/^\d{6}$/.test(twoFACode.value.trim())) {
    toast.error({ message: '请输入 6 位动态验证码' })
    return
  }
  twoFABusy.value = true
  try {
    await $fetch('/api/auth/2fa/enable', {
      method: 'POST',
      body: { csrfToken: csrfToken.value, code: twoFACode.value.trim() },
    })
    toast.success({ message: '两步验证已启用' })
    twoFACode.value = ''
    await fetchTwoFactorStatus()
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    toast.error({ message: '确认失败', description: error?.data?.message || '请重新输入' })
  } finally {
    twoFABusy.value = false
  }
}

// 停用：需当前动态码（服务端亦接受账户密码回退）
async function disable2FA() {
  if (!/^\d{6}$/.test(twoFACode.value.trim())) {
    toast.error({ message: '请输入 6 位动态验证码' })
    return
  }
  twoFABusy.value = true
  try {
    await $fetch('/api/auth/2fa/disable', {
      method: 'POST',
      body: { csrfToken: csrfToken.value, code: twoFACode.value.trim() },
    })
    toast.success({ message: '两步验证已停用' })
    twoFACode.value = ''
    await fetchTwoFactorStatus()
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    toast.error({ message: '停用失败', description: error?.data?.message || '请重新输入' })
  } finally {
    twoFABusy.value = false
  }
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success({ message: '已复制' }),
    () => toast.error({ message: '复制失败' }),
  )
}

// ===== 已信任设备管理 =====
async function fetchTrustedDevices() {
  try {
    const res = await $fetch<TrustedDevicesResponse>('/api/admin/2fa/devices')
    trustedDevices.value = res.devices
  } catch {
    // 失败不阻断页面
  }
}

async function revokeDevice(id: number) {
  if (devicesBusy.value != null) return
  devicesBusy.value = id
  try {
    await $fetch(`/api/admin/2fa/devices/${id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken.value },
    })
    toast.success({ message: '已撤回该设备' })
    await fetchTrustedDevices()
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    toast.error({ message: '撤回失败', description: error?.data?.message || '请稍后重试' })
  } finally {
    devicesBusy.value = null
  }
}

function startRename(d: TrustedDevice) {
  editingName.value = d.name || ''
  renamingId.value = d.id
}

function cancelRename() {
  renamingId.value = null
  editingName.value = ''
}

async function saveRename() {
  if (renamingId.value == null) return
  if (devicesBusy.value != null) return
  const id = renamingId.value
  devicesBusy.value = id
  try {
    await $fetch(`/api/admin/2fa/devices/${id}`, {
      method: 'PUT',
      body: { csrfToken: csrfToken.value, name: editingName.value.trim() },
    })
    toast.success({ message: '设备名称已更新' })
    renamingId.value = null
    editingName.value = ''
    await fetchTrustedDevices()
  } catch (rawError: unknown) {
    const error = rawError as ApiError
    toast.error({ message: '重命名失败', description: error?.data?.message || '请稍后重试' })
  } finally {
    devicesBusy.value = null
  }
}

function fmtDeviceTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(() => {
  fetchUser()
  fetchTwoFactorStatus()
  fetchTrustedDevices()
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

    <!-- 加载状态 / 错误态 -->
    <Card v-else class="p-12">
      <div v-if="loadError" class="flex flex-col items-center justify-center gap-4 text-center">
        <Icon name="lucide:circle-alert" class="size-8 text-destructive" />
        <p class="text-muted-foreground">{{ loadError }}</p>
        <Button variant="outline" @click="fetchUser">
          <Icon name="lucide:refresh-cw" class="mr-2 size-4" />
          重试
        </Button>
      </div>
      <div v-else class="flex flex-col items-center justify-center gap-4">
        <div class="size-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p class="text-muted-foreground">加载中...</p>
      </div>
    </Card>

    <!-- 两步验证 -->
    <Card v-if="!loading && user" class="mt-6">
      <div class="p-6 space-y-4">
        <div class="flex items-center gap-3">
          <Icon name="lucide:shield-check" class="size-5 text-primary" />
          <div>
            <h3 class="text-lg font-semibold">两步验证</h3>
            <p class="text-sm text-muted-foreground">用认证器 App 为登录额外加一层保障</p>
          </div>
        </div>

        <Separator />

        <!-- 已启用 -->
        <div v-if="twoFactor.enabled" class="space-y-4">
          <div class="flex items-center gap-2 text-sm">
            <span class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">已启用</span>
            <span class="text-muted-foreground">登录时除密码外还需认证器动态码</span>
          </div>
          <div class="flex items-end gap-2 max-w-sm">
            <Input v-model="twoFACode" inputmode="numeric" maxlength="6" placeholder="输入动态码以停用" class="flex-1" />
            <Button variant="destructive" :disabled="twoFABusy" @click="disable2FA">停用</Button>
          </div>
          <p class="text-xs text-muted-foreground">若认证器不可用，可改用账户密码停用（服务端支持密码回退）。</p>
        </div>

        <!-- 未启用 -->
        <div v-else class="space-y-4">
          <template v-if="!twoFASetup.secret">
            <p class="text-sm text-muted-foreground">启用后登录需输入认证器 App 的 6 位动态码，可防密码泄露被登入。</p>
            <Button :disabled="twoFABusy" @click="enable2FA">
              <Icon v-if="twoFABusy" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
              启用两步验证
            </Button>
          </template>

          <!-- 已生成密钥：引导录入并确认 -->
          <template v-else>
            <div class="space-y-2 text-sm">
              <p>1. 用认证器 App（Google Authenticator / Authy / 1Password）扫码添加，或手动输入下方密钥。</p>
              <div class="flex justify-center py-1">
                <img
                  v-if="twoFASetup.qrDataUrl"
                  :src="twoFASetup.qrDataUrl"
                  alt="两步验证二维码"
                  class="size-44 rounded-md border bg-white p-1"
                >
              </div>
              <div class="space-y-1.5 rounded-md border bg-muted/40 p-3">
                <p class="text-xs text-muted-foreground">密钥（手动输入）</p>
                <div class="flex items-center gap-2">
                  <code class="font-mono text-sm break-all">{{ twoFASetup.secret }}</code>
                  <Button variant="ghost" size="sm" @click="copyText(twoFASetup.secret)">复制</Button>
                </div>
                <p class="text-xs text-muted-foreground pt-1">或打开链接自动添加：</p>
                <div class="flex items-center gap-2">
                  <code class="font-mono text-xs break-all text-muted-foreground max-w-[90%]">{{ twoFASetup.otpauthUrl }}</code>
                  <Button variant="ghost" size="sm" @click="copyText(twoFASetup.otpauthUrl)">复制</Button>
                </div>
              </div>
              <p class="pt-1">2. 输入 App 显示的当前动态码，确认后即启用。</p>
              <div class="flex items-end gap-2 max-w-sm">
                <Input v-model="twoFACode" inputmode="numeric" maxlength="6" placeholder="6 位动态码" class="flex-1" />
                <Button :disabled="twoFABusy" @click="confirmEnable">确认启用</Button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Card>

    <!-- 已信任设备 -->
    <Card v-if="!loading && user" class="mt-6">
      <div class="p-6 space-y-4">
        <div class="flex items-center gap-3">
          <Icon name="lucide:smartphone" class="size-5 text-primary" />
          <div>
            <h3 class="text-lg font-semibold">已信任设备</h3>
            <p class="text-sm text-muted-foreground">勾选「信任此设备」登录的设备；撤回后需重新输动态码</p>
          </div>
        </div>
        <Separator />
        <p v-if="trustedDevices.length === 0" class="text-sm text-muted-foreground">暂无已信任的设备</p>
        <ul v-else class="space-y-3">
          <li v-for="d in trustedDevices" :key="d.id" class="flex items-center justify-between gap-4 rounded-md border p-3">
            <div class="min-w-0 space-y-0.5">
              <template v-if="renamingId === d.id">
                <div class="flex items-center gap-2">
                  <Input
                    v-model="editingName"
                    maxlength="100"
                    placeholder="设备名称"
                    class="h-8 flex-1"
                    @keyup.enter="saveRename"
                  />
                  <Button size="sm" :disabled="devicesBusy != null" @click="saveRename">
                    {{ devicesBusy === d.id ? '保存中...' : '保存' }}
                  </Button>
                  <Button size="sm" variant="ghost" :disabled="devicesBusy != null" @click="cancelRename">
                    取消
                  </Button>
                </div>
              </template>
              <template v-else>
                <div class="flex items-center gap-1.5">
                  <p class="truncate text-sm font-medium" :title="d.name || ''">{{ d.name || '未知设备' }}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-6 px-2 text-muted-foreground"
                    :disabled="devicesBusy != null"
                    title="重命名"
                    @click="startRename(d)"
                  >
                    <Icon name="lucide:pencil" class="size-3.5" />
                  </Button>
                </div>
              </template>
              <p class="text-xs text-muted-foreground">
                IP {{ d.ip || '-' }} · 最近登录 {{ fmtDeviceTime(d.lastUsedAt) }} · 到期 {{ fmtDeviceTime(d.expiresAt) }}
              </p>
            </div>
            <Button size="sm" variant="destructive" :disabled="devicesBusy != null" @click="revokeDevice(d.id)">
              {{ devicesBusy === d.id ? '撤回中...' : '撤回' }}
            </Button>
          </li>
        </ul>
      </div>
    </Card>
  </AdminLayout>
</template>
