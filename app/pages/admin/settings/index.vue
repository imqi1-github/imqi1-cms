<script setup lang="ts">
const settings = ref({
  siteName: 'ImQi1',
  siteUrl: 'https://imqi1.com',
  siteDesc: '做技术的分享者、生活的摄影师、时事的评论员。',
  siteKeywords: '棋,ImQi1,棋的小站,生活,科技,编程,学习',
  siteIcp: '',
  commentEnabled: true,
  commentModeration: false,
  commentMarkdown: false,
  commentAvatarService: 'gravatar',
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentRequireMail: true,
  commentRequireLink: false,
  commentInterval: 60,
})

const avatarServices = [
  { value: 'gravatar', label: 'Gravatar' },
  { value: 'cravatar', label: 'Cravatar' },
  { value: 'weavatar', label: 'WeAvatar' },
]

// 加载设置
async function loadSettings() {
  try {
    settings.value = await $fetch('/api/admin/settings') as any
  } catch (error) {
    console.error('获取设置失败:', error)
  }
}

// 保存设置
async function saveSettings() {
  try {
    await $fetch('/api/admin/settings', {
      method: 'POST',
      body: settings.value,
    })
    alert('设置已保存')
  } catch (error) {
    console.error('保存失败:', error)
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <AdminLayout>
    <div class="mb-6">
      <h2 class="text-2xl font-bold">系统设置</h2>
      <p class="text-sm text-muted-foreground mt-1">管理系统配置和参数</p>
    </div>

    <div class="space-y-6">
      <!-- 基本信息 -->
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
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

      <!-- 评论设置 -->
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
              <Input
                id="commentPageSize"
                v-model.number="settings.commentPageSize"
                type="number"
                min="1"
                max="100"
              />
            </div>
          </div>

          <Separator />

          <!-- 回复和限制设置 -->
          <div class="space-y-4">
            <h4 class="text-sm font-medium">回复和限制</h4>
            <div class="space-y-2">
              <Label for="commentMaxLevel">最大回复层级</Label>
              <Input
                id="commentMaxLevel"
                v-model.number="settings.commentMaxLevel"
                type="number"
                min="0"
                max="10"
              />
              <p class="text-xs text-muted-foreground">
                设置为 0 时不允许回复评论，默认为 4 层
              </p>
            </div>
            <div class="space-y-2">
              <Label for="commentInterval">发布间隔（秒）</Label>
              <Input
                id="commentInterval"
                v-model.number="settings.commentInterval"
                type="number"
                min="0"
                max="3600"
              />
              <p class="text-xs text-muted-foreground">
                同一 IP 发布评论的最小间隔时间，默认为 60 秒
              </p>
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

      <!-- 保存按钮 -->
      <div class="flex justify-end">
        <Button size="lg" @click="saveSettings">
          <Icon name="lucide:save" class="mr-2 size-4" />
          保存设置
        </Button>
      </div>
    </div>
  </AdminLayout>
</template>
