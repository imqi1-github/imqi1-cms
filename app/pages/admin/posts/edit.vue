<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const toast = useToast();

// 判断是新建还是编辑
const isEdit = computed(() => !!route.query.cid);
const postId = computed(() => (route.query.cid ? Number(route.query.cid) : null));

const activeTab = ref("content");
const loading = ref(false);

const title = ref("");
const description = ref("");
const slug = ref("");
const content = ref("");
const publishDate = ref("");
const showToc = ref(true);
const manyCovers = ref(false);
const status = ref("draft"); // draft | published

// 附件相关
const attachments = ref<any[]>([]);
const showUploadDialog = ref(false);
const uploading = ref(false);
const uploadProgress = ref(0);
const fileInputRef = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);

// 获取附件列表
const fetchAttachments = async () => {
  if (!postId.value) return;

  try {
    const res = await $fetch(`/api/admin/attachments/list?cid=${postId.value}`) as any;
    if (res?.success) {
      attachments.value = res.data || [];
    }
  } catch (error) {
    console.error('获取附件失败:', error);
  }
};

// 选择文件
const handleFileSelect = () => {
  fileInputRef.value?.click();
};

// 处理文件选择
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    await uploadFiles(Array.from(files));
  }
  // 重置 input
  target.value = '';
};

// 处理拖放
const handleDrop = async (event: DragEvent) => {
  event.preventDefault();
  dragOver.value = false;

  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    await uploadFiles(Array.from(files));
  }
};

// 上传文件
const uploadFiles = async (files: File[]) => {
  if (!postId.value) {
    toast.error({
      message: '请先保存文章',
      description: '需要先保存文章后才能上传附件',
    });
    return;
  }

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
      if (!allowedTypes.includes(file.type)) {
        toast.error({
          message: '不支持的文件类型',
          description: file.name,
        });
        continue;
      }

      // 验证文件大小 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error({
          message: '文件过大',
          description: `${file.name} 超过 10MB 限制`,
        });
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await $fetch(`/api/admin/attachments/upload?cid=${postId.value}`, {
          method: 'POST',
          body: formData,
        }) as any;

        if (res?.success) {
          attachments.value.push(res.data);
          toast.success({
            message: '上传成功',
            description: file.name,
          });
        }
      } catch (error) {
        toast.error({
          message: '上传失败',
          description: file.name,
        });
      }

      uploadProgress.value = Math.round(((i + 1) / files.length) * 100);
    }
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
  }
};

// 删除附件
const deleteAttachment = async (attachment: any) => {
  const confirmed = confirm(`确定要删除附件 "${attachment.name}" 吗？`);
  if (!confirmed) return;

  try {
    await $fetch(`/api/admin/attachments/${attachment.id}`, {
      method: 'DELETE',
    });

    attachments.value = attachments.value.filter(a => a.id !== attachment.id);
    toast.success({
      message: '删除成功',
    });
  } catch (error) {
    toast.error({
      message: '删除失败',
    });
  }
};

// 复制链接
const copyLink = async (url: string) => {
  const fullUrl = `${window.location.origin}${url}`;
  try {
    await navigator.clipboard.writeText(fullUrl);
    toast.success({
      message: '已复制链接',
      description: fullUrl,
    });
  } catch {
    toast.error({
      message: '复制失败',
    });
  }
};

// 获取文章数据
const fetchPost = async () => {
  if (!postId.value) return;

  loading.value = true;
  try {
    const res = await $fetch(`/api/admin/posts/${postId.value}`);
    if ((res as any).success) {
      const post = (res as any).data;
      title.value = post.title || "";
      description.value = post.desc || "";
      slug.value = post.slug || "";
      content.value = post.content || "";
      manyCovers.value = post.many_covers || false;
      showToc.value = post.show_toc !== false;
      status.value = post.status === 1 ? "published" : "draft";
      // 格式化发布日期为 datetime-local 输入格式
      if (post.create_time) {
        const date = new Date(post.create_time);
        publishDate.value = date.toISOString().slice(0, 16);
      }

      // 同时获取附件列表
      await fetchAttachments();
    }
  } catch (e: any) {
    toast.error({
      message: "获取文章失败",
      description: e?.data?.message || "请稍后重试",
    });
  } finally {
    loading.value = false;
  }
};

// 保存文章
const savePost = async () => {
  if (!title.value) {
    toast.error({
      message: "标题不能为空",
    });
    return;
  }

  loading.value = true;

  try {
    const body = {
      title: title.value,
      desc: description.value,
      slug: slug.value,
      content: content.value,
      status: status.value === "published" ? 1 : 0,
      manyCovers: manyCovers.value,
      covers: null,
      showToc: showToc.value,
      publishDate: publishDate.value,
    };

    let res;
    if (isEdit.value && postId.value) {
      // 更新文章
      res = await $fetch(`/api/admin/posts/${postId.value}`, {
        method: "PUT",
        body,
      });
    } else {
      // 创建文章
      res = await $fetch("/api/admin/posts", {
        method: "POST",
        body,
      });
    }

    if ((res as any).success) {
      toast.success({
        message: isEdit.value ? "文章更新成功" : "文章创建成功",
      });

      // 如果是新建，跳转到编辑页面
      if (!isEdit.value) {
        const newCid = (res as any).data.cid;
        // 更新 postId 引用
        postId.value = newCid;
        await fetchAttachments();
        await router.push(`/admin/posts/edit?cid=${newCid}`);
      }
    }
  } catch (e: any) {
    toast.error({
      message: "保存失败",
      description: e?.data?.message || "请稍后重试",
    });
  } finally {
    loading.value = false;
  }
};

// 页面加载时获取文章数据
onMounted(() => {
  if (isEdit.value) {
    fetchPost();
  }
});
</script>

<template>
  <AdminLayout>
    <!-- 骨架屏 -->
    <div v-if="loading && isEdit" class="flex gap-6">
      <!-- 左侧主内容区骨架屏 -->
      <div class="flex-1 space-y-6">
        <!-- Tabs 导航骨架屏 -->
        <div class="grid grid-cols-3 gap-2">
          <div class="h-10 bg-muted rounded animate-pulse" />
          <div class="h-10 bg-muted rounded animate-pulse" />
          <div class="h-10 bg-muted rounded animate-pulse" />
        </div>

        <!-- 文章内容骨架屏 -->
        <Card class="overflow-hidden px-0 pt-0">
          <CardContent class="p-6">
            <div class="space-y-3">
              <div v-for="i in 8" :key="i" class="space-y-2">
                <div class="h-4 bg-muted rounded animate-pulse" />
                <div class="h-4 bg-muted rounded w-5/6 animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 右侧设置栏骨架屏 -->
      <div class="w-80 space-y-6">
        <!-- 发布设置骨架屏 -->
        <Card>
          <CardHeader>
            <div class="h-5 bg-muted rounded w-20 animate-pulse" />
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              <div class="flex gap-2">
                <div class="h-10 bg-muted rounded flex-1 animate-pulse" />
                <div class="h-10 bg-muted rounded flex-1 animate-pulse" />
              </div>
            </div>
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-20 animate-pulse" />
              <div class="h-10 bg-muted rounded animate-pulse" />
            </div>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <div class="h-4 bg-muted rounded w-16 animate-pulse" />
                <div class="h-3 bg-muted rounded w-32 animate-pulse" />
              </div>
              <div class="size-10 bg-muted rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>

        <!-- 分类设置骨架屏 -->
        <Card>
          <CardHeader>
            <div class="h-5 bg-muted rounded w-20 animate-pulse" />
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              <div class="flex gap-2">
                <div class="h-10 bg-muted rounded flex-1 animate-pulse" />
                <div class="h-10 bg-muted rounded w-10 animate-pulse" />
              </div>
            </div>
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              <div class="h-10 bg-muted rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>

        <!-- 操作按钮骨架屏 -->
        <Card>
          <CardContent class="pt-6 space-y-2">
            <div class="h-10 bg-muted rounded w-full animate-pulse" />
            <div class="h-10 bg-muted rounded w-full animate-pulse" />
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- 实际内容 -->
    <div v-else class="flex gap-6">
      <!-- 左侧主内容区 -->
      <div class="flex-1 space-y-6">
        <!-- Tabs 导航 -->
        <Tabs v-model="activeTab" default-value="content">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="content">
              <Icon name="lucide:file-text" class="mr-2 size-4" />
              文章内容
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Icon name="lucide:settings" class="mr-2 size-4" />
              文章设置
            </TabsTrigger>
            <TabsTrigger value="attachments">
              <Icon name="lucide:paperclip" class="mr-2 size-4" />
              附件管理
              <Badge v-if="attachments.length > 0" variant="secondary" class="ml-2">
                {{ attachments.length }}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <!-- 文章内容 Tab -->
          <TabsContent value="content" class="mt-6">
            <Card class="overflow-hidden px-0 pt-0">
              <CardContent class="p-0">
                <MarkdownEditor v-model="content" :post-id="postId" @attachment-updated="fetchAttachments" />
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
                  <Input id="title" v-model="title" placeholder="请输入文章标题" class="text-lg font-medium" />
                </div>

                <!-- 描述 -->
                <div class="space-y-2">
                  <Label for="description">文章描述</Label>
                  <Textarea id="description" v-model="description" placeholder="请输入文章描述，用于 SEO 和分享" :rows="2" />
                </div>

                <!-- Slug -->
                <div class="space-y-2">
                  <Label for="slug">文章 Slug</Label>
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-muted-foreground">/post/</span>
                    <Input id="slug" v-model="slug" placeholder="article-slug" class="flex-1" />
                  </div>
                  <p class="text-xs text-muted-foreground">文章的唯一标识符，用于 URL，留空将自动生成</p>
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
                    <p class="text-xs text-muted-foreground">开启后可以设置多张封面轮播显示</p>
                  </div>
                  <Switch v-model:checked="manyCovers" />
                </div>

                <!-- 封面列表 -->
                <div class="space-y-3">
                  <Label>封面列表</Label>
                  <div class="border-2 border-dashed rounded-md p-8 text-center">
                    <Icon name="lucide:image-plus" class="size-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p class="text-sm text-muted-foreground mb-2">拖拽图片到此处，或点击上传</p>
                    <Button variant="outline" size="sm">
                      <Icon name="lucide:upload" class="mr-2 size-4" />
                      选择图片
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <!-- 附件管理 Tab -->
          <TabsContent value="attachments" class="mt-6">
            <!-- 隐藏的文件输入 -->
            <input
              ref="fileInputRef"
              type="file"
              class="hidden"
              accept="image/*,video/*"
              multiple
              @change="handleFileChange"
            >

            <Card>
              <CardHeader>
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle>文章附件</CardTitle>
                    <CardDescription>管理此文章的图片和视频附件</CardDescription>
                  </div>
                  <Button :disabled="uploading" @click="handleFileSelect">
                    <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:upload'" :class="{ 'animate-spin': uploading }" class="mr-2 size-4" />
                    {{ uploading ? `上传中 ${uploadProgress}%` : '上传附件' }}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <!-- 拖拽上传区域 -->
                <div
                  v-if="attachments.length === 0"
                  class="border-2 border-dashed rounded-lg p-12 text-center transition-colors"
                  :class="dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'"
                  @dragover.prevent="dragOver = true"
                  @dragleave.prevent="dragOver = false"
                  @drop.prevent="handleDrop"
                  @click="handleFileSelect"
                >
                  <Icon name="lucide:paperclip" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
                  <p class="text-muted-foreground text-lg mb-2">拖拽文件到此处</p>
                  <p class="text-sm text-muted-foreground mb-4">或点击选择文件</p>
                  <p class="text-xs text-muted-foreground">支持 JPG、PNG、GIF、WebP、MP4、WebM，最大 10MB</p>
                </div>

                <!-- 附件列表 -->
                <div v-else class="space-y-4">
                  <!-- 上传区域（有附件时显示小一点） -->
                  <div
                    class="border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer"
                    :class="dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'"
                    @dragover.prevent="dragOver = true"
                    @dragleave.prevent="dragOver = false"
                    @drop.prevent="handleDrop"
                    @click="handleFileSelect"
                  >
                    <Icon name="lucide:plus" class="size-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p class="text-sm text-muted-foreground">点击或拖拽上传更多附件</p>
                  </div>

                  <!-- 类型筛选 -->
                  <div class="flex items-center gap-4">
                    <span class="text-sm text-muted-foreground">筛选:</span>
                    <div class="flex gap-2">
                      <Badge variant="outline" class="cursor-pointer">全部 ({{ attachments.length }})</Badge>
                      <Badge variant="outline" class="cursor-pointer">图片</Badge>
                      <Badge variant="outline" class="cursor-pointer">视频</Badge>
                    </div>
                  </div>

                  <!-- 附件网格 -->
                  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div
                      v-for="item in attachments"
                      :key="item.id"
                      class="group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <!-- 预览图 -->
                      <div class="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        <img
                          v-if="item.type === 'image'"
                          :src="item.url"
                          :alt="item.name"
                          class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div v-else class="flex flex-col items-center text-muted-foreground">
                          <Icon name="lucide:film" class="size-12 mb-2" />
                          <span class="text-xs">视频预览</span>
                        </div>
                      </div>

                      <!-- 操作遮罩 -->
                      <div class="absolute inset-0 top-[calc(100%-40px)] bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-2 pb-2">
                        <Button variant="secondary" size="sm" class="h-7" @click.stop="copyLink(item.url)" title="复制链接">
                          <Icon name="lucide:copy" class="size-3" />
                        </Button>
                        <Button variant="destructive" size="sm" class="h-7" @click.stop="deleteAttachment(item)" title="删除">
                          <Icon name="lucide:trash-2" class="size-3" />
                        </Button>
                      </div>

                      <!-- 信息 -->
                      <div class="p-2">
                        <p class="text-xs font-medium truncate" :title="item.name">
                          {{ item.name }}
                        </p>
                        <p class="text-xs text-muted-foreground">{{ item.size }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- 使用提示 -->
            <Card class="mt-4 bg-muted/50">
              <CardContent class="p-4">
                <div class="flex items-start gap-3">
                  <Icon name="lucide:info" class="size-5 text-muted-foreground mt-0.5" />
                  <div class="text-sm text-muted-foreground">
                    <p class="font-medium text-foreground mb-1">附件使用说明</p>
                    <ul class="space-y-1 list-disc list-inside">
                      <li>上传的附件可以插入到文章内容中</li>
                      <li>支持图片格式：JPG、PNG、GIF、WebP</li>
                      <li>支持视频格式：MP4、WebM</li>
                      <li>单个文件大小不超过 10MB</li>
                      <li>点击复制链接可获取附件 URL，用于 Markdown 中</li>
                    </ul>
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
                <Button :variant="status === 'draft' ? 'default' : 'outline'" class="flex-1" @click="status = 'draft'">
                  <Icon name="lucide:file" class="mr-2 size-4" />
                  草稿
                </Button>
                <Button :variant="status === 'published' ? 'default' : 'outline'" class="flex-1" @click="status = 'published'">
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
                <p class="text-xs text-muted-foreground">在文章侧边栏显示目录导航</p>
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
              {{ loading ? "保存中..." : "保存文章" }}
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
