<script setup lang="ts">
import { siteConfig } from "~~/site.config";
import type { AdminSettings } from "~/types/apis/admin/settings";

const loading = ref(true);
const activeTab = ref("basic");
const showResetDialog = ref(false);
const toast = useToast();
const csrfToken = ref("");
const initializing = ref(false);

const settings = ref<AdminSettings>({
  siteName: siteConfig.siteName,
  siteUrl: siteConfig.siteUrl,
  siteDesc: siteConfig.seo.description,
  siteIcp: "",
  commentEnabled: true,
  commentModeration: false,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentRequireMail: true,
  commentRequireLink: false,
  commentInterval: 60,
  postPageSize: 12,
  feedCacheInterval: 8,
  homeCustomText: siteConfig.homeCustomText,
  musicPlaylistId: "9255074836 || netease",
  photoCategorySlug: "shot",
  moderationApiType: "1",
  baiduAppId: "",
  baiduApiKey: "",
  baiduSecretKey: "",
  baiduCheckAdmin: false,
  emailLogEnabled: true,
  emailPushType: "none",
  smtpHost: "",
  smtpUser: "",
  smtpAddress: "",
  smtpPassword: "",
  smtpSecureMode: "tls",
  smtpPort: 465,
  smtpFromName: "",
  adminEmail: "",
  notifyAdmin: false,
  uploadLocation: "local",
  cosSecretId: "",
  cosSecretKey: "",
  cosBucket: "",
  cosRegion: "",
  cosSourceDomain: "",
  cosCdnDomain: "",
  cosImageSuffix: "webp",
  sessionStoreType: "memory",
  linkAutoApprove: false,
  searchCacheEnabled: false,
  searchCacheExpire: 300,
});

const avatarServices = [
  { value: "gravatar", label: "Gravatar" },
  { value: "cravatar", label: "Cravatar" },
  { value: "weavatar", label: "WeAvatar" },
];

const moderationApiTypes = [
  { value: "1", label: "不使用" },
  { value: "2", label: "百度内容审核平台" },
];

const emailPushTypes = [
  { value: "none", label: "不推送" },
  { value: "smtp", label: "使用 SMTP" },
];

const smtpSecureModes = [
  { value: "none", label: "不加密" },
  { value: "ssl", label: "SSL" },
  { value: "tls", label: "TLS" },
];

const sessionStoreTypes = [
  { value: "memory", label: "内存存储" },
  { value: "file", label: "文件存储" },
  { value: "database", label: "数据库存储" },
];

const testingEmail = ref(false);

async function testEmail() {
  testingEmail.value = true;
  try {
    const result = await $fetch("/api/admin/mail/test", {
      method: "POST",
      body: {
        to: settings.value.adminEmail || settings.value.smtpAddress || settings.value.smtpUser,
      },
    });

    if (result.success) {
      toast.success({
        message: result.message,
      });
    } else {
      toast.error({
        message: result.message,
      });
    }
  } catch (error) {
    toast.error({
      message: error instanceof Error ? error.message : "未知错误",
    });
  } finally {
    testingEmail.value = false;
  }
}

const defaultSettings: AdminSettings = {
  siteName: siteConfig.siteName,
  siteUrl: siteConfig.siteUrl,
  siteDesc: siteConfig.seo.description,
  siteIcp: "",
  commentEnabled: true,
  commentModeration: false,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentRequireMail: true,
  commentRequireLink: false,
  commentInterval: 60,
  postPageSize: 12,
  feedCacheInterval: 8,
  homeCustomText: siteConfig.homeCustomText,
  musicPlaylistId: "9255074836 || netease",
  photoCategorySlug: "shot",
  moderationApiType: "1",
  baiduAppId: "",
  baiduApiKey: "",
  baiduSecretKey: "",
  baiduCheckAdmin: false,
  emailLogEnabled: true,
  emailPushType: "none",
  smtpHost: "",
  smtpUser: "",
  smtpAddress: "",
  smtpPassword: "",
  smtpSecureMode: "tls",
  smtpPort: 465,
  smtpFromName: "",
  adminEmail: "",
  notifyAdmin: false,
  uploadLocation: "local",
  cosSecretId: "",
  cosSecretKey: "",
  cosBucket: "",
  cosRegion: "",
  cosSourceDomain: "",
  cosCdnDomain: "",
  cosImageSuffix: "webp",
  sessionStoreType: "memory",
  linkAutoApprove: false,
  searchCacheEnabled: false,
  searchCacheExpire: 300,
};

// 加载设置
async function loadSettings() {
  loading.value = true;
  try {
    // 获取 CSRF token
    const csrfRes = await $fetch("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) {
      csrfToken.value = csrfRes.data.token;
    }

    settings.value = await $fetch<AdminSettings>("/api/admin/settings");
  } catch (error) {
    console.error("获取设置失败:", error);
  } finally {
    loading.value = false;
  }
}

// 保存设置
async function saveSettings() {
  try {
    await $fetch("/api/admin/settings", {
      method: "POST",
      body: {
        csrfToken: csrfToken.value,
        ...settings.value,
      },
    });
    toast.success({
      message: "设置已保存",
    });
  } catch (error) {
    console.error("保存失败:", error);
    toast.error({
      message: "保存失败",
    });
  }
}

// 重置为默认值
async function resetToDefaults() {
  settings.value = { ...defaultSettings };
  showResetDialog.value = false;
  try {
    await $fetch("/api/admin/settings", {
      method: "POST",
      body: {
        csrfToken: csrfToken.value,
        ...defaultSettings,
      },
    });
    toast.success({
      message: "已重置为默认值",
    });
  } catch (error) {
    console.error("重置失败:", error);
    toast.error({
      message: "重置失败",
    });
  }
}

// 初始化缺失的配置项
async function initializeMissingSettings() {
  initializing.value = true;
  try {
    const result = await $fetch("/api/admin/settings/init", {
      method: "POST",
    });

    if (result.success) {
      toast.success({
        message: result.message,
      });
      // 重新加载设置
      await loadSettings();
    } else {
      toast.error({
        message: result.message || "初始化失败",
      });
    }
  } catch (error) {
    console.error("初始化失败:", error);
    toast.error({
      message: "初始化失败",
    });
  } finally {
    initializing.value = false;
  }
}

onMounted(() => {
  loadSettings();
});
</script>

<template>
  <AdminLayout>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">系统设置</h2>
        <p class="text-sm text-muted-foreground mt-1">管理系统配置和参数</p>
      </div>
      <div class="flex gap-2">
        <Button
          variant="outline"
          :disabled="initializing"
          @click="initializeMissingSettings">
          <Icon
            :name="initializing ? 'lucide:loader-2' : 'lucide:database-zap'"
            :class="{ 'animate-spin': initializing }"
            class="mr-2 size-4"
          />
          {{ initializing ? '补全中...' : '补全缺失配置' }}
        </Button>
        <Button variant="outline" @click="showResetDialog = true">
          <Icon name="lucide:rotate-ccw" class="mr-2 size-4" />
          重置为默认
        </Button>
      </div>
    </div>

    <div v-if="loading" class="space-y-6">
      <!-- Tab 骨架屏 -->
      <Card>
        <CardContent class="pt-6">
          <div class="flex gap-6">
            <div class="h-10 bg-muted rounded w-24 animate-pulse" />
            <div class="h-10 bg-muted rounded w-24 animate-pulse" />
            <div class="h-10 bg-muted rounded w-24 animate-pulse" />
            <div class="h-10 bg-muted rounded w-24 animate-pulse" />
            <div class="h-10 bg-muted rounded w-24 animate-pulse" />
            <div class="h-10 bg-muted rounded w-24 animate-pulse" />
          </div>
        </CardContent>
      </Card>

      <!-- 内容骨架屏 -->
      <Card>
        <CardContent class="pt-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              <div class="h-10 bg-muted rounded animate-pulse" />
            </div>
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              <div class="h-10 bg-muted rounded animate-pulse" />
            </div>
            <div class="space-y-2 md:col-span-2">
              <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              <div class="h-10 bg-muted rounded animate-pulse" />
            </div>
            <div class="space-y-2 md:col-span-2">
              <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              <div class="h-10 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 保存按钮骨架屏 -->
      <div class="flex justify-end">
        <div class="h-10 bg-muted rounded w-24 animate-pulse" />
      </div>
    </div>

    <div v-else class="space-y-6">
      <!-- Tab 导航 -->
      <Tabs v-model="activeTab" default-value="basic">
        <!-- 移动端：下拉选择器 -->
        <div class="sm:hidden mb-6">
          <Select v-model="activeTab">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="选择设置分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:settings" class="size-4" />
                  基本信息
                </div>
              </SelectItem>
              <SelectItem value="comment">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:message-square" class="size-4" />
                  评论设置
                </div>
              </SelectItem>
              <SelectItem value="appearance">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:palette" class="size-4" />
                  外观设置
                </div>
              </SelectItem>
              <SelectItem value="upload">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:upload-cloud" class="size-4" />
                  附件上传
                </div>
              </SelectItem>
              <SelectItem value="advanced">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:shield" class="size-4" />
                  高级设置
                </div>
              </SelectItem>
              <SelectItem value="links">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:link" class="size-4" />
                  其他
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 桌面端：标签栏 -->
        <TabsList class="hidden sm:grid w-full max-w-3xl grid-cols-6">
          <TabsTrigger value="basic">
            <Icon name="lucide:settings" class="mr-2 size-4" />
            基本信息
          </TabsTrigger>
          <TabsTrigger value="comment">
            <Icon name="lucide:message-square" class="mr-2 size-4" />
            评论设置
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Icon name="lucide:palette" class="mr-2 size-4" />
            外观设置
          </TabsTrigger>
          <TabsTrigger value="upload">
            <Icon name="lucide:upload-cloud" class="mr-2 size-4" />
            附件上传
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Icon name="lucide:shield" class="mr-2 size-4" />
            高级设置
          </TabsTrigger>
          <TabsTrigger value="links">
            <Icon name="lucide:link" class="mr-2 size-4" />
            其他
          </TabsTrigger>
        </TabsList>

        <!-- 基本信息 Tab -->
        <TabsContent value="basic" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>基本设置</CardTitle>
              <CardDescription>配置网站的基本信息</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="siteName">站点名称</Label>
                  <Input id="siteName" v-model="settings.siteName" :placeholder="siteConfig.siteName" />
                </div>
                <div class="space-y-2">
                  <Label for="siteUrl">站点地址</Label>
                  <Input id="siteUrl" v-model="settings.siteUrl" :placeholder="siteConfig.siteUrl" />
                </div>
                <div class="space-y-2 md:col-span-2">
                  <Label for="siteDesc">站点描述</Label>
                  <Input id="siteDesc" v-model="settings.siteDesc" :placeholder="siteConfig.seo.description" />
                </div>
                <div class="space-y-2">
                  <Label for="siteIcp">备案号</Label>
                  <Input id="siteIcp" v-model="settings.siteIcp" placeholder="备案号" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- 评论设置 Tab -->
        <TabsContent value="comment" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>评论设置</CardTitle>
              <CardDescription>配置评论功能和显示规则</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- 基础设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">基础设置</h4>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="commentEnabled">开启评论</Label>
                    <p class="text-sm text-muted-foreground">是否允许用户发表评论</p>
                  </div>
                  <Switch id="commentEnabled" v-model="settings.commentEnabled" />
                </div>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="commentModeration">评论审核</Label>
                    <p class="text-sm text-muted-foreground">新评论需要审核后才能显示</p>
                  </div>
                  <Switch id="commentModeration" v-model="settings.commentModeration" />
                </div>
              </div>

              <Separator />

              <!-- 头像和显示设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">头像和显示</h4>
                <div class="space-y-2">
                  <Label for="commentAvatarService">头像服务</Label>
                  <Select v-model="settings.commentAvatarService">
                    <SelectTrigger id="commentAvatarService">
                      <SelectValue placeholder="选择头像服务" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="service in avatarServices" :key="service.value" :value="service.value">
                        {{ service.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="commentPageSize">每页显示评论数</Label>
                  <Input id="commentPageSize" v-model.number="settings.commentPageSize" type="number" min="1" max="100" />
                </div>
              </div>

              <Separator />

              <!-- 回复和限制设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">回复和限制</h4>
                <div class="space-y-2">
                  <Label for="commentMaxLevel">最大回复层级</Label>
                  <Input id="commentMaxLevel" v-model.number="settings.commentMaxLevel" type="number" min="0" max="10" />
                  <p class="text-xs text-muted-foreground">设置为 0 时不允许回复评论，默认为 4 层</p>
                </div>
                <div class="space-y-2">
                  <Label for="commentInterval">发布间隔（秒）</Label>
                  <Input id="commentInterval" v-model.number="settings.commentInterval" type="number" min="0" max="3600" />
                  <p class="text-xs text-muted-foreground">同一 IP 发布评论的最小间隔时间，默认为 60 秒</p>
                </div>
              </div>

              <Separator />

              <!-- 必填设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">必填项</h4>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="commentRequireMail">必填邮箱</Label>
                    <p class="text-sm text-muted-foreground">发表评论时必须填写邮箱</p>
                  </div>
                  <Switch id="commentRequireMail" v-model="settings.commentRequireMail" />
                </div>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="commentRequireLink">必填链接</Label>
                    <p class="text-sm text-muted-foreground">发表评论时必须填写个人链接</p>
                  </div>
                  <Switch id="commentRequireLink" v-model="settings.commentRequireLink" />
                </div>
              </div>

              <Separator />

              <!-- 审核平台设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">审核平台</h4>
                <div class="space-y-2">
                  <Label for="moderationApiType">评论审核 API</Label>
                  <Select v-model="settings.moderationApiType">
                    <SelectTrigger id="moderationApiType">
                      <SelectValue placeholder="选择审核平台" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="type in moderationApiTypes" :key="type.value" :value="type.value">
                        {{ type.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p class="text-xs text-muted-foreground">选择第三方内容审核平台，自动检测违规评论</p>
                </div>

                <!-- 百度内容审核平台配置 -->
                <div v-if="settings.moderationApiType === '2'" class="space-y-4 mt-4 p-4 bg-muted/30 rounded-lg">
                  <div class="flex items-center gap-2 mb-3">
                    <Icon name="lucide:shield" class="size-4 text-primary" />
                    <span class="text-sm font-medium">百度内容审核平台配置</span>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="space-y-2">
                      <Label for="baiduAppId">AppID</Label>
                      <Input id="baiduAppId" v-model="settings.baiduAppId" placeholder="输入 AppID" />
                    </div>
                    <div class="space-y-2">
                      <Label for="baiduApiKey">API Key</Label>
                      <Input id="baiduApiKey" v-model="settings.baiduApiKey" placeholder="输入 API Key" />
                    </div>
                    <div class="space-y-2">
                      <Label for="baiduSecretKey">Secret Key</Label>
                      <Input id="baiduSecretKey" v-model="settings.baiduSecretKey" type="password" placeholder="输入 Secret Key" />
                    </div>
                  </div>
                  <div class="flex items-center justify-between pt-2">
                    <div class="space-y-0.5">
                      <Label for="baiduCheckAdmin">验证管理员评论</Label>
                      <p class="text-sm text-muted-foreground">是否也审核管理员发表的评论</p>
                    </div>
                    <Switch id="baiduCheckAdmin" v-model="settings.baiduCheckAdmin" />
                  </div>
                </div>

                <!-- 不使用时的提示 -->
                <div v-if="settings.moderationApiType === '1'" class="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                  未启用第三方审核平台，评论将由人工审核
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- 外观设置 Tab -->
        <TabsContent value="appearance" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>外观设置</CardTitle>
              <CardDescription>配置网站的外观和资源路径</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- 首页内容 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">首页内容</h4>
                <div class="space-y-2">
                  <Label for="homeCustomText">首页自定义文字</Label>
                  <Textarea
                    id="homeCustomText"
                    v-model="settings.homeCustomText"
                    rows="3"
                    :placeholder="siteConfig.homeCustomText" />
                  <p class="text-xs text-muted-foreground">显示在首页的自定义内容，支持 HTML 标签</p>
                </div>
              </div>

              <Separator />

              <!-- 音乐设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">音乐设置</h4>
                <div class="space-y-2">
                  <Label for="musicPlaylistId">音乐列表 ID</Label>
                  <Input id="musicPlaylistId" v-model="settings.musicPlaylistId" placeholder="9255074836 || netease" />
                  <p class="text-xs text-muted-foreground">网易云音乐歌单 ID，格式：歌单ID || 来源（支持 netease、qq 等）</p>
                </div>
              </div>

              <Separator />

              <!-- 图片处理 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">图片处理</h4>
                <div class="space-y-2">
                  <Label for="photoCategorySlug">图片分类 Slug</Label>
                  <Input id="photoCategorySlug" v-model="settings.photoCategorySlug" placeholder="shot" />
                  <p class="text-xs text-muted-foreground">图片作品分类在 URL 中的标识符</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- 附件上传 Tab -->
        <TabsContent value="upload" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>附件上传设置</CardTitle>
              <CardDescription>配置附件上传存储策略和腾讯云 COS 参数</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="space-y-2">
                <Label for="uploadLocation">上传策略</Label>
                <Select v-model="settings.uploadLocation">
                  <SelectTrigger id="uploadLocation">
                    <SelectValue placeholder="选择上传策略" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">本地存储</SelectItem>
                    <SelectItem value="cos">腾讯云 COS</SelectItem>
                  </SelectContent>
                </Select>
                <p class="text-xs text-muted-foreground">本地存储会保存到 public/uploads；腾讯云 COS 会使用下方云存储配置。</p>
              </div>

              <!-- 腾讯云 COS 配置 -->
              <div v-if="settings.uploadLocation === 'cos'" class="space-y-4">
                <Separator />

                <!-- 基本配置 -->
                <div class="space-y-4">
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:cloud" class="size-4 text-primary" />
                    <h4 class="text-sm font-medium">腾讯云 COS 配置</h4>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <Label for="cosSecretId">SecretId</Label>
                      <Input id="cosSecretId" v-model="settings.cosSecretId" placeholder="输入 SecretId" />
                    </div>
                    <div class="space-y-2">
                      <Label for="cosSecretKey">SecretKey</Label>
                      <Input id="cosSecretKey" v-model="settings.cosSecretKey" type="password" placeholder="输入 SecretKey" />
                    </div>
                    <div class="space-y-2">
                      <Label for="cosBucket">存储桶名称</Label>
                      <Input id="cosBucket" v-model="settings.cosBucket" placeholder="如: bucket-name-1234567890" />
                      <p class="text-xs text-muted-foreground">存储桶的完整名称，包含 AppID</p>
                    </div>
                    <div class="space-y-2">
                      <Label for="cosRegion">地域</Label>
                      <Input id="cosRegion" v-model="settings.cosRegion" placeholder="如: ap-guangzhou" />
                      <p class="text-xs text-muted-foreground">存储桶所在地域，如 ap-guangzhou、ap-beijing</p>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label for="cosSourceDomain">源站域名</Label>
                    <Input id="cosSourceDomain" v-model="settings.cosSourceDomain" placeholder="https://bucket-name.cos.ap-guangzhou.myqcloud.com" />
                    <p class="text-xs text-muted-foreground">COS 源站域名，用于上传文件。留空则使用默认域名</p>
                  </div>
                  <div class="space-y-2">
                    <Label for="cosCdnDomain">CDN 加速域名（可选）</Label>
                    <Input id="cosCdnDomain" v-model="settings.cosCdnDomain" placeholder="https://cdn.example.com" />
                    <p class="text-xs text-muted-foreground">配置的 CDN 加速域名，用于外部访问文件。留空则使用源站域名</p>
                  </div>
                  <div class="space-y-2">
                    <Label for="cosImageSuffix">上传后的图片后缀（可选）</Label>
                    <Input id="cosImageSuffix" v-model="settings.cosImageSuffix" placeholder="webp" />
                    <p class="text-xs text-muted-foreground">用于云存储自动处理图片格式。将所有上传的图片转换为该后缀，不影响视频。留空则保持原格式。默认值: webp</p>
                  </div>
                </div>

                <Separator />

                <!-- 配置说明 -->
                <div class="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div class="flex items-start gap-3">
                    <Icon name="lucide:info" class="size-5 text-blue-500 mt-0.5" />
                    <div class="space-y-2 text-sm">
                      <p class="font-medium">配置说明：</p>
                      <ul class="list-disc list-inside space-y-1 text-muted-foreground">
                        <li>在腾讯云控制台的 <strong>访问管理 - API密钥管理</strong> 中获取 SecretId 和 SecretKey</li>
                        <li>存储桶格式：<code>bucket-name-appid</code>，可在存储桶列表中查看</li>
                        <li>地域代码：ap-guangzhou（广州）、ap-beijing（北京）、ap-shanghai（上海）等</li>
                        <li>确保存储桶权限设置为 <strong>公共读</strong>，否则上传的文件无法访问</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="p-4 bg-muted/30 rounded-lg space-y-3">
                <div class="flex items-start gap-3">
                  <Icon name="lucide:hard-drive" class="size-5 text-blue-500 mt-0.5" />
                  <div class="space-y-2 text-sm">
                    <p class="font-medium">本地存储说明：</p>
                    <ul class="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>附件会保存到项目的 <code>public/uploads</code> 目录。</li>
                      <li>实况照片仍会保留原始 JPEG 字节，不会进行图片格式转换。</li>
                      <li>生产环境请确保该目录会随部署持久化或挂载到持久卷。</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- 高级设置 Tab -->
        <TabsContent value="advanced" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Session 存储</CardTitle>
              <CardDescription>配置用户登录会话的存储方式</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label for="sessionStoreType">存储方式</Label>
                  <Select v-model="settings.sessionStoreType">
                    <SelectTrigger id="sessionStoreType">
                      <SelectValue placeholder="选择存储方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="type in sessionStoreTypes" :key="type.value" :value="type.value">
                        {{ type.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div class="flex items-start gap-3">
                    <Icon name="lucide:info" class="size-5 text-blue-500 mt-0.5" />
                    <div class="space-y-2 text-sm">
                      <p class="font-medium">存储方式说明：</p>
                      <ul class="list-disc list-inside space-y-1 text-muted-foreground">
                        <li><strong>内存存储</strong>：Session 保存在内存中，服务重启后需要重新登录</li>
                        <li><strong>文件存储</strong>：Session 保存在 .sessions 目录中，服务重启后保持登录状态</li>
                        <li><strong>数据库存储</strong>：Session 保存在数据库中，支持多实例部署</li>
                      </ul>
                      <p class="text-amber-600 dark:text-amber-500">⚠️ 更改存储方式后，所有用户需要重新登录</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 邮件配置 Card -->
          <Card>
            <CardHeader>
              <CardTitle>邮件配置</CardTitle>
              <CardDescription>配置邮件发送和通知功能</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- 基础设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">基础设置</h4>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="emailLogEnabled">记录邮件日志</Label>
                    <p class="text-sm text-muted-foreground">是否记录邮件发送日志到数据库</p>
                  </div>
                  <Switch id="emailLogEnabled" v-model="settings.emailLogEnabled" />
                </div>
                <div class="space-y-2">
                  <Label for="emailPushType">邮件推送方式</Label>
                  <Select v-model="settings.emailPushType">
                    <SelectTrigger id="emailPushType">
                      <SelectValue placeholder="选择推送方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="type in emailPushTypes" :key="type.value" :value="type.value">
                        {{ type.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p class="text-xs text-muted-foreground">选择邮件发送方式，SMTP 支持自定义邮件服务器</p>
                </div>
              </div>

              <Separator />

              <!-- SMTP 配置 -->
              <div v-if="settings.emailPushType === 'smtp'" class="space-y-4">
                <div class="flex items-center justify-between">
                  <h4 class="text-sm font-medium">SMTP 服务器配置</h4>
                  <Button variant="outline" size="sm" :disabled="testingEmail" @click="testEmail">
                    <Icon name="lucide:send" class="mr-2 size-4" />
                    {{ testingEmail ? "发送中..." : "发送测试邮件" }}
                  </Button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label for="smtpHost">SMTP 服务器地址</Label>
                    <Input id="smtpHost" v-model="settings.smtpHost" placeholder="smtp.example.com" />
                  </div>
                  <div class="space-y-2">
                    <Label for="smtpPort">SMTP 服务端口</Label>
                    <Input id="smtpPort" v-model.number="settings.smtpPort" type="number" min="1" max="65535" placeholder="465" />
                  </div>
                  <div class="space-y-2">
                    <Label for="smtpUser">SMTP 登录用户</Label>
                    <Input id="smtpUser" v-model="settings.smtpUser" placeholder="username@example.com" />
                  </div>
                  <div class="space-y-2">
                    <Label for="smtpPassword">SMTP 登录密码</Label>
                    <Input id="smtpPassword" v-model="settings.smtpPassword" type="password" placeholder="••••••••" />
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="space-y-2">
                    <Label for="smtpSecureMode">SMTP 加密模式</Label>
                    <Select v-model="settings.smtpSecureMode">
                      <SelectTrigger id="smtpSecureMode">
                        <SelectValue placeholder="选择加密模式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="mode in smtpSecureModes" :key="mode.value" :value="mode.value">
                          {{ mode.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="space-y-2 md:col-span-2">
                    <Label for="smtpAddress">SMTP 邮箱地址</Label>
                    <Input id="smtpAddress" v-model="settings.smtpAddress" placeholder="noreply@example.com" />
                  </div>
                </div>

                <Separator />

                <!-- 发件人设置 -->
                <div class="space-y-4">
                  <h4 class="text-sm font-medium">发件人设置</h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <Label for="smtpFromName">发件人昵称</Label>
                      <Input id="smtpFromName" v-model="settings.smtpFromName" :placeholder="`${siteConfig.siteName} 博客`" />
                      <p class="text-xs text-muted-foreground">邮件接收人看到的发件人名称</p>
                    </div>
                    <div class="space-y-2">
                      <Label for="adminEmail">站长收件邮箱</Label>
                      <Input id="adminEmail" v-model="settings.adminEmail" placeholder="admin@example.com" />
                    </div>
                  </div>
                  <div class="flex items-center justify-between">
                    <div class="space-y-0.5">
                      <Label for="notifyAdmin">通知站长</Label>
                      <p class="text-sm text-muted-foreground">新评论或通知时是否发送邮件给站长</p>
                    </div>
                    <Switch id="notifyAdmin" v-model="settings.notifyAdmin" />
                  </div>
                </div>
              </div>

              <!-- 不使用 SMTP 时的提示 -->
              <div v-if="settings.emailPushType === 'none'" class="p-8 bg-muted/30 rounded-lg text-center">
                <Icon name="lucide:mail-x" class="size-12 text-muted-foreground/50 mx-auto mb-4" />
                <p class="text-muted-foreground">未启用邮件推送功能，系统将不发送任何通知邮件</p>
              </div>
            </CardContent>
          </Card>

          <!-- 搜索优化配置 Card -->
          <Card>
            <CardHeader>
              <CardTitle>搜索优化</CardTitle>
              <CardDescription>配置搜索功能缓存，提升搜索性能</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="searchCacheEnabled">启用搜索缓存</Label>
                    <p class="text-sm text-muted-foreground">是否将热门搜索结果缓存到 Redis</p>
                  </div>
                  <Switch id="searchCacheEnabled" v-model="settings.searchCacheEnabled" />
                </div>

                <div v-if="settings.searchCacheEnabled" class="space-y-2">
                  <Label for="searchCacheExpire">缓存过期时间（秒）</Label>
                  <Input
                    id="searchCacheExpire"
                    v-model.number="settings.searchCacheExpire"
                    type="number"
                    min="60"
                    max="3600"
                    placeholder="300"
                  />
                  <p class="text-xs text-muted-foreground">
                    热门搜索结果的缓存时间，建议 300 秒（5分钟）
                  </p>
                </div>

                <div class="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div class="flex items-start gap-3">
                    <Icon name="lucide:lightbulb" class="size-5 text-blue-500 mt-0.5" />
                    <div class="space-y-2 text-sm">
                      <p class="font-medium">搜索缓存说明：</p>
                      <ul class="list-disc list-inside space-y-1 text-muted-foreground">
                        <li>启用后，热门搜索关键词的结果将被缓存</li>
                        <li>缓存命中时响应速度可提升 80-90%</li>
                        <li>首次搜索后，相同关键词将直接返回缓存结果</li>
                        <li>需要配置 Redis 才能使用此功能</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- 其他设置 Tab -->
        <TabsContent value="links" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>其他设置</CardTitle>
              <CardDescription>配置其他功能选项</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- 内容设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">内容设置</h4>
                <div class="space-y-2">
                  <Label for="postPageSize">每页显示文章数</Label>
                  <Input id="postPageSize" v-model.number="settings.postPageSize" type="number" min="1" max="100" />
                  <p class="text-xs text-muted-foreground">文章列表每页显示的文章数量，默认为 12 篇</p>
                </div>
                <div class="space-y-2">
                  <Label for="feedCacheInterval">订阅信息更新间隔</Label>
                  <Input id="feedCacheInterval" v-model.number="settings.feedCacheInterval" type="number" min="1" max="168" />
                  <p class="text-xs text-muted-foreground">RSS 订阅信息缓存更新时间，单位为小时，默认为 8 小时</p>
                </div>
              </div>

              <Separator />

              <!-- 友情链接设置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">友情链接</h4>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="linkAutoApprove">自动同意友情链接申请</Label>
                    <p class="text-sm text-muted-foreground">开启后，在前台友情链接的表单会新增一个可以看到友情链接的输入框，可自动同意友情链接申请</p>
                  </div>
                  <Switch id="linkAutoApprove" v-model="settings.linkAutoApprove" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <!-- 保存按钮 -->
      <div class="flex justify-end">
        <Button size="lg" @click="saveSettings">
          <Icon name="lucide:save" class="mr-2 size-4" />
          保存设置
        </Button>
      </div>
    </div>

    <!-- 重置确认弹窗 -->
    <Dialog v-model:open="showResetDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置为默认值</DialogTitle>
          <DialogDescription> 确定要将所有设置重置为默认值吗？此操作不可撤销。 </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showResetDialog = false"> 取消 </Button>
          <Button variant="destructive" @click="resetToDefaults"> 确认重置 </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
