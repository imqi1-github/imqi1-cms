<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()

// 判断是新建还是编辑
const isEdit = computed(() => !!route.query.cid)
const postId = computed(() => route.query.cid ? Number(route.query.cid) : null)

const activeTab = ref('content')
const loading = ref(false)

const title = ref('')
const description = ref('')
const slug = ref('')
const content = ref('')
const publishDate = ref('')
const showToc = ref(true)
const manyCovers = ref(false)
const status = ref('draft') // draft | published

// 获取文章数据
const fetchPost = async () => {
  if (!postId.value) return

  try {
    const res = await $fetch(`/api/admin/posts/${postId.value}`)
    if ((res as any).success) {
      const post = (res as any).data
      title.value = post.title || ''
      description.value = post.desc || ''
      slug.value = post.slug || ''
      content.value = post.content || ''
      manyCovers.value = post.many_covers || false
      showToc.value = post.show_toc !== false
      status.value = post.status === 1 ? 'published' : 'draft'
      // 格式化发布日期为 datetime-local 输入格式
      if (post.create_time) {
        const date = new Date(post.create_time)
        publishDate.value = date.toISOString().slice(0, 16)
      }
    }
  } catch (e: any) {
    toast.error({
      message: '获取文章失败',
      description: e?.data?.message || '请稍后重试',
    })
  }
}

// 保存文章
const savePost = async () => {
  if (!title.value) {
    toast.error({
      message: '标题不能为空',
    })
    return
  }

  loading.value = true

  try {
    const body = {
      title: title.value,
      desc: description.value,
      slug: slug.value,
      content: content.value,
      status: status.value === 'published' ? 1 : 0,
      manyCovers: manyCovers.value,
      covers: null,
      showToc: showToc.value,
      publishDate: publishDate.value,
    }

    let res
    if (isEdit.value && postId.value) {
      // 更新文章
      res = await $fetch(`/api/admin/posts/${postId.value}`, {
        method: 'PUT',
        body,
      })
    } else {
      // 创建文章
      res = await $fetch('/api/admin/posts', {
        method: 'POST',
        body,
      })
    }

    if ((res as any).success) {
      toast.success({
        message: isEdit.value ? '文章更新成功' : '文章创建成功',
      })

      // 如果是新建，跳转到编辑页面
      if (!isEdit.value) {
        const newCid = (res as any).data.cid
        await router.push(`/admin/posts/edit?cid=${newCid}`)
      }
    }
  } catch (e: any) {
    toast.error({
      message: '保存失败',
      description: e?.data?.message || '请稍后重试',
    })
  } finally {
    loading.value = false
  }
}

// 页面加载时获取文章数据
onMounted(() => {
  if (isEdit.value) {
    fetchPost()
  }
})
</script>

<template>
  <AdminLayout>
    <div class="flex gap-6">
      <!-- 左侧主内容区 -->
      <div class="flex-1 space-y-6">
        <!-- Tabs 导航 -->
        <Tabs v-model="activeTab" default-value="content">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="content">
              <Icon name="lucide:file-text" class="mr-2 size-4" />
              文章内容
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Icon name="lucide:settings" class="mr-2 size-4" />
              文章设置
            </TabsTrigger>
          </TabsList>

          <!-- 文章内容 Tab -->
          <TabsContent value="content" class="mt-6">
            <Card class="overflow-hidden pt-0">
              <CardContent class="p-0">
                <MarkdownEditor v-model="content" />
              </CardContent>
            </Card>
          </TabsContent>

          <!-- 文章设置 Tab -->
          <TabsContent value="settings" class="mt-6 space-y-6">
            <!-- 基本信息 -->
            <Card>
              <CardHeader>
                <CardTitle>基本信息</CardTitle>
                <CardDescription>设置文章的基本属性</CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- 标题 -->
                <div class="space-y-2">
                  <Label for="title">文章标题</Label>
                  <Input
                    id="title"
                    v-model="title"
                    placeholder="请输入文章标题"
                    class="text-lg font-medium"
                  />
                </div>

                <!-- 描述 -->
                <div class="space-y-2">
                  <Label for="description">文章描述</Label>
                  <Textarea
                    id="description"
                    v-model="description"
                    placeholder="请输入文章描述，用于 SEO 和分享"
                    :rows="2"
                  />
                </div>

                <!-- Slug -->
                <div class="space-y-2">
                  <Label for="slug">文章 Slug</Label>
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-muted-foreground">/post/</span>
                    <Input
                      id="slug"
                      v-model="slug"
                      placeholder="article-slug"
                      class="flex-1"
                    />
                  </div>
                  <p class="text-xs text-muted-foreground">
                    文章的唯一标识符，用于 URL，留空将自动生成
                  </p>
                </div>
              </CardContent>
            </Card>

            <!-- 封面设置 -->
            <Card>
              <CardHeader>
                <CardTitle>封面设置</CardTitle>
                <CardDescription>设置文章封面图片</CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- 多封面开关 -->
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label>启用多封面</Label>
                    <p class="text-xs text-muted-foreground">
                      开启后可以设置多张封面轮播显示
                    </p>
                  </div>
                  <Switch v-model:checked="manyCovers" />
                </div>

                <!-- 封面列表 -->
                <div class="space-y-3">
                  <Label>封面列表</Label>
                  <div class="border-2 border-dashed rounded-md p-8 text-center">
                    <Icon name="lucide:image-plus" class="size-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p class="text-sm text-muted-foreground mb-2">
                      拖拽图片到此处，或点击上传
                    </p>
                    <Button variant="outline" size="sm">
                      <Icon name="lucide:upload" class="mr-2 size-4" />
                      选择图片
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <!-- 右侧设置栏 -->
      <div class="w-80 space-y-6">
        <!-- 发布设置 -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">发布设置</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 发布状态 -->
            <div class="space-y-2">
              <Label>发布状态</Label>
              <div class="flex gap-2">
                <Button
                  :variant="status === 'draft' ? 'default' : 'outline'"
                  class="flex-1"
                  @click="status = 'draft'"
                >
                  <Icon name="lucide:file" class="mr-2 size-4" />
                  草稿
                </Button>
                <Button
                  :variant="status === 'published' ? 'default' : 'outline'"
                  class="flex-1"
                  @click="status = 'published'"
                >
                  <Icon name="lucide:globe" class="mr-2 size-4" />
                  发布
                </Button>
              </div>
            </div>

            <!-- 发布日期 -->
            <div class="space-y-2">
              <Label for="publishDate">发布日期</Label>
              <Input id="publishDate" v-model="publishDate" type="datetime-local" />
            </div>

            <!-- 是否展示目录 -->
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <Label>展示目录</Label>
                <p class="text-xs text-muted-foreground">
                  在文章侧边栏显示目录导航
                </p>
              </div>
              <Switch v-model:checked="showToc" />
            </div>
          </CardContent>
        </Card>

        <!-- 分类设置 -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">分类设置</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <Label>文章分类</Label>
              <div class="flex gap-2">
                <Input placeholder="选择分类" class="flex-1" />
                <Button variant="outline" size="icon">
                  <Icon name="lucide:plus" class="size-4" />
                </Button>
              </div>
            </div>
            <div class="space-y-2">
              <Label>文章标签</Label>
              <Input placeholder="输入标签，用逗号分隔" />
            </div>
          </CardContent>
        </Card>

        <!-- 操作按钮 -->
        <Card>
          <CardContent class="pt-6 space-y-2">
            <Button class="w-full" size="lg" :disabled="loading" @click="savePost">
              <Icon name="lucide:save" class="mr-2 size-4" />
              {{ loading ? '保存中...' : '保存文章' }}
            </Button>
            <Button variant="outline" class="w-full" size="lg">
              <Icon name="lucide:eye" class="mr-2 size-4" />
              预览
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </AdminLayout>
</template>
