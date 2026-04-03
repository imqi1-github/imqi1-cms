<script setup lang="ts">
const loading = ref(true);
const activeTab = ref("basic");
const showResetDialog = ref(false);
const settings = ref({
  siteName: "ImQi1",
  siteUrl: "https://imqi1.com",
  siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
  siteKeywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习",
  siteIcp: "",
  commentEnabled: true,
  commentModeration: false,
  commentMarkdown: false,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentRequireMail: true,
  commentRequireLink: false,
  commentInterval: 60,
  postPageSize: 12,
  homeCustomText: '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>',
  staticFilePath: "https://cdn.imqi1.com/static",
  musicPlaylistId: "9255074836 || netease",
  photoCategorySlug: "shot",
  photoCoverSuffix: "!600px.width",
  postCoverSuffix: "!1000px",
});

const avatarServices = [
  { value: "gravatar", label: "Gravatar" },
  { value: "cravatar", label: "Cravatar" },
  { value: "weavatar", label: "WeAvatar" },
];

const defaultSettings = {
  siteName: "ImQi1",
  siteUrl: "https://imqi1.com",
  siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
  siteKeywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习",
  siteIcp: "",
  commentEnabled: true,
  commentModeration: false,
  commentMarkdown: false,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentRequireMail: true,
  commentRequireLink: false,
  commentInterval: 60,
  postPageSize: 12,
  homeCustomText: '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>',
  staticFilePath: "https://cdn.imqi1.com/static",
  musicPlaylistId: "9255074836 || netease",
  photoCategorySlug: "shot",
  photoCoverSuffix: "!600px.width",
  postCoverSuffix: "!1000px",
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
    alert("设置已保存");
  } catch (error) {
    console.error("保存失败:", error);
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
    alert("已重置为默认值");
  } catch (error) {
    console.error("重置失败:", error);
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
        <TabsList class="grid w-full max-w-xl grid-cols-4">
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
                  <Switch id="commentEnabled" v-model:checked="settings.commentEnabled" />
                </div>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="commentModeration">评论审核</Label>
                    <p class="text-sm text-muted-foreground">新评论需要审核后才能显示</p>
                  </div>
                  <Switch id="commentModeration" v-model:checked="settings.commentModeration" />
                </div>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="commentMarkdown">Markdown 支持</Label>
                    <p class="text-sm text-muted-foreground">允许在评论中使用 Markdown 语法</p>
                  </div>
                  <Switch id="commentMarkdown" v-model:checked="settings.commentMarkdown" />
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
                  <Switch id="commentRequireMail" v-model:checked="settings.commentRequireMail" />
                </div>
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label for="commentRequireLink">必填链接</Label>
                    <p class="text-sm text-muted-foreground">发表评论时必须填写个人链接</p>
                  </div>
                  <Switch id="commentRequireLink" v-model:checked="settings.commentRequireLink" />
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
                    placeholder='<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>'
                  />
                  <p class="text-xs text-muted-foreground">显示在首页的自定义内容，支持 HTML 标签</p>
                </div>
              </div>

              <Separator />

              <!-- 资源路径 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">资源路径</h4>
                <div class="space-y-2">
                  <Label for="staticFilePath">静态文件路径</Label>
                  <Input id="staticFilePath" v-model="settings.staticFilePath" placeholder="https://cdn.imqi1.com/static" />
                  <p class="text-xs text-muted-foreground">CDN 或静态资源的访问路径，用于加载图片、样式等资源</p>
                </div>
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
                <div class="space-y-2">
                  <Label for="photoCoverSuffix">图片封面后缀</Label>
                  <Input id="photoCoverSuffix" v-model="settings.photoCoverSuffix" placeholder="!600px.width" />
                  <p class="text-xs text-muted-foreground">图片封面图的处理参数后缀，用于控制显示尺寸</p>
                </div>
                <div class="space-y-2">
                  <Label for="postCoverSuffix">文章封面后缀</Label>
                  <Input id="postCoverSuffix" v-model="settings.postCoverSuffix" placeholder="!1000px" />
                  <p class="text-xs text-muted-foreground">文章封面图的处理参数后缀，用于控制显示尺寸</p>
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
          <DialogDescription>
            确定要将所有设置重置为默认值吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showResetDialog = false">
            取消
          </Button>
          <Button variant="destructive" @click="resetToDefaults">
            确认重置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
