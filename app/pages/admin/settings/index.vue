<script setup lang="ts">
const loading = ref(true);
const activeTab = ref("basic");
const showResetDialog = ref(false);
const toast = useToast();

const settings = ref({
  siteName: "ImQi1",
  siteUrl: "https://imqi1.com",
  siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
  siteKeywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习",
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
  homeCustomText: '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>',
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
  upyunDomain: "https://cdn.imqi1.com",
  upyunService: "",
  upyunOperator: "",
  upyunPassword: "",
  upyunImageProcess: false,
  upyunThumbnailVersion: "",
  upyunOutputMode: "",
  upyunTokenEnabled: false,
  upyunTokenKey: "",
  upyunTokenExpire: 1800,
  sessionStoreType: "memory",
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

const uploadLocations = [
  { value: "local", label: "本地" },
  { value: "upyun", label: "又拍云" },
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
    const result = (await $fetch("/api/admin/mail/test", {
      method: "POST",
      body: {
        to: settings.value.adminEmail || settings.value.smtpAddress || settings.value.smtpUser,
      },
    })) as any;

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

const defaultSettings = {
  siteName: "ImQi1",
  siteUrl: "https://imqi1.com",
  siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
  siteKeywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习",
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
  homeCustomText: '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>',
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
  upyunDomain: "https://cdn.imqi1.com",
  upyunService: "",
  upyunOperator: "",
  upyunPassword: "",
  upyunImageProcess: false,
  upyunThumbnailVersion: "",
  upyunOutputMode: "",
  upyunTokenEnabled: false,
  upyunTokenKey: "",
  upyunTokenExpire: 1800,
  sessionStoreType: "memory",
};

// 加载设置
async function loadSettings() {
  loading.value = true;
  try {
    settings.value = (await $fetch("/api/admin/settings")) as any;
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
      body: settings.value,
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
      body: defaultSettings,
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
      <Button variant="outline" @click="showResetDialog = true">
        <Icon name="lucide:rotate-ccw" class="mr-2 size-4" />
        重置为默认
      </Button>
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
              <SelectItem value="reading">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:book-open" class="size-4" />
                  阅读设置
                </div>
              </SelectItem>
              <SelectItem value="appearance">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:palette" class="size-4" />
                  外观设置
                </div>
              </SelectItem>
              <SelectItem value="email">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:mail" class="size-4" />
                  邮件配置
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
            </SelectContent>
          </Select>
        </div>

        <!-- 桌面端：标签栏 -->
        <TabsList class="hidden sm:grid w-full max-w-3xl grid-cols-7">
          <TabsTrigger value="basic">
            <Icon name="lucide:settings" class="mr-2 size-4" />
            基本信息
          </TabsTrigger>
          <TabsTrigger value="comment">
            <Icon name="lucide:message-square" class="mr-2 size-4" />
            评论设置
          </TabsTrigger>
          <TabsTrigger value="reading">
            <Icon name="lucide:book-open" class="mr-2 size-4" />
            阅读设置
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Icon name="lucide:palette" class="mr-2 size-4" />
            外观设置
          </TabsTrigger>
          <TabsTrigger value="email">
            <Icon name="lucide:mail" class="mr-2 size-4" />
            邮件配置
          </TabsTrigger>
          <TabsTrigger value="upload">
            <Icon name="lucide:upload-cloud" class="mr-2 size-4" />
            附件上传
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Icon name="lucide:shield" class="mr-2 size-4" />
            高级设置
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
                  <Input id="siteName" v-model="settings.siteName" placeholder="ImQi1" />
                </div>
                <div class="space-y-2">
                  <Label for="siteUrl">站点地址</Label>
                  <Input id="siteUrl" v-model="settings.siteUrl" placeholder="https://imqi1.com" />
                </div>
                <div class="space-y-2 md:col-span-2">
                  <Label for="siteDesc">站点描述</Label>
                  <Input id="siteDesc" v-model="settings.siteDesc" placeholder="做技术的分享者、生活的摄影师、时事的评论员。" />
                </div>
                <div class="space-y-2 md:col-span-2">
                  <Label for="siteKeywords">关键词</Label>
                  <Input id="siteKeywords" v-model="settings.siteKeywords" placeholder="棋,ImQi1,棋的小站,生活,科技,编程,学习" />
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

        <!-- 阅读设置 Tab -->
        <TabsContent value="reading" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>阅读设置</CardTitle>
              <CardDescription>配置文章列表的显示方式</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                <Label for="postPageSize">每页显示文章数</Label>
                <Input id="postPageSize" v-model.number="settings.postPageSize" type="number" min="1" max="100" />
                <p class="text-xs text-muted-foreground">文章列表每页显示的文章数量，默认为 12 篇</p>
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
                    placeholder='<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>' />
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

        <!-- 邮件配置 Tab -->
        <TabsContent value="email" class="space-y-6 mt-6">
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
                      <Input id="smtpFromName" v-model="settings.smtpFromName" placeholder="ImQi1 博客" />
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
                <Icon name="lucide:mail-off" class="size-12 text-muted-foreground/50 mx-auto mb-4" />
                <p class="text-muted-foreground">未启用邮件推送功能，系统将不发送任何通知邮件</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- 附件上传 Tab -->
        <TabsContent value="upload" class="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>附件上传设置</CardTitle>
              <CardDescription>配置附件存储位置和云服务参数</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <!-- 存储位置 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">存储位置</h4>
                <div class="space-y-2">
                  <Label for="uploadLocation">默认位置</Label>
                  <Select v-model="settings.uploadLocation">
                    <SelectTrigger id="uploadLocation">
                      <SelectValue placeholder="选择存储位置" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="location in uploadLocations" :key="location.value" :value="location.value">
                        {{ location.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p class="text-xs text-muted-foreground">选择附件上传的默认存储位置</p>
                </div>
              </div>

              <!-- 又拍云配置 -->
              <div v-if="settings.uploadLocation === 'upyun'" class="space-y-4">
                <Separator />

                <!-- 基本配置 -->
                <div class="space-y-4">
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:cloud" class="size-4 text-primary" />
                    <h4 class="text-sm font-medium">又拍云配置</h4>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="space-y-2">
                      <Label for="upyunService">服务名称</Label>
                      <Input id="upyunService" v-model="settings.upyunService" placeholder="输入服务名称" />
                    </div>
                    <div class="space-y-2">
                      <Label for="upyunOperator">操作员</Label>
                      <Input id="upyunOperator" v-model="settings.upyunOperator" placeholder="输入操作员名称" />
                    </div>
                    <div class="space-y-2">
                      <Label for="upyunPassword">密码</Label>
                      <Input id="upyunPassword" v-model="settings.upyunPassword" type="password" placeholder="输入密码" />
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label for="upyunDomain">绑定域名</Label>
                    <Input id="upyunDomain" v-model="settings.upyunDomain" placeholder="https://cdn.imqi1.com" />
                    <p class="text-xs text-muted-foreground">又拍云绑定的 CDN 域名，用于访问上传的文件</p>
                  </div>
                </div>

                <Separator />

                <!-- 图片处理 -->
                <div class="space-y-4">
                  <h4 class="text-sm font-medium">图片处理</h4>
                  <div class="flex items-center justify-between">
                    <div class="space-y-0.5">
                      <Label for="upyunImageProcess">开启图片处理</Label>
                      <p class="text-sm text-muted-foreground">启用又拍云图片处理功能</p>
                    </div>
                    <Switch id="upyunImageProcess" v-model="settings.upyunImageProcess" />
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <Label for="upyunThumbnailVersion">缩略图版本名称</Label>
                      <Input id="upyunThumbnailVersion" v-model="settings.upyunThumbnailVersion" placeholder="如: thumbnail" />
                      <p class="text-xs text-muted-foreground">用于生成缩略图的版本标识</p>
                    </div>
                    <div class="space-y-2">
                      <Label for="upyunOutputMode">转码输出模式</Label>
                      <Input id="upyunOutputMode" v-model="settings.upyunOutputMode" placeholder="如: avif" />
                      <p class="text-xs text-muted-foreground">图片转码后的输出格式</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <!-- Token 防盗链 -->
                <div class="space-y-4">
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:shield-check" class="size-4 text-primary" />
                    <h4 class="text-sm font-medium">Token 防盗链</h4>
                  </div>
                  <div class="flex items-center justify-between">
                    <div class="space-y-0.5">
                      <Label for="upyunTokenEnabled">开启 Token 防盗链</Label>
                      <p class="text-sm text-muted-foreground">启用后资源链接将包含 Token 验证</p>
                    </div>
                    <Switch id="upyunTokenEnabled" v-model="settings.upyunTokenEnabled" />
                  </div>
                  <div v-if="settings.upyunTokenEnabled" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <Label for="upyunTokenKey">密钥</Label>
                      <Input id="upyunTokenKey" v-model="settings.upyunTokenKey" type="password" placeholder="输入防盗链密钥" />
                    </div>
                    <div class="space-y-2">
                      <Label for="upyunTokenExpire">过期时间（秒）</Label>
                      <Input id="upyunTokenExpire" v-model.number="settings.upyunTokenExpire" type="number" min="0" placeholder="1800" />
                      <p class="text-xs text-muted-foreground">Token 有效期，默认 1800 秒（30分钟）</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 本地存储提示 -->
              <div v-if="settings.uploadLocation === 'local'" class="p-8 bg-muted/30 rounded-lg text-center">
                <Icon name="lucide:hard-drive" class="size-12 text-muted-foreground/50 mx-auto mb-4" />
                <p class="text-muted-foreground">使用本地存储，附件将保存在服务器本地磁盘</p>
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
