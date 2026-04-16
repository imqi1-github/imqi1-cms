<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const toast = useToast();

// 判断是新建还是编辑
const isEdit = computed(() => !!route.query.cid);
const postId = computed(() => (route.query.cid ? Number(route.query.cid) : null));

const activeTab = ref("content");
const loading = ref(false);

// 跟踪是否有未保存的更改
const hasUnsavedChanges = ref(false);

// 保存初始内容用于比较
const initialContent = ref("");
const initialTitle = ref("");
const initialDescription = ref("");
const initialSlug = ref("");
const initialCoversInput = ref("");
const initialStatus = ref("");
const initialPublishDate = ref("");
const initialShowToc = ref(false);
const initialManyCovers = ref(false);
const initialCategoryIds = ref<number[]>([]);
const initialTagIds = ref<number[]>([]);

const title = ref("");
const description = ref("");
const slug = ref("");
const content = ref("");
const publishDate = ref("");
const showToc = ref(false);
const manyCovers = ref(false);
const status = ref("published"); // draft | published
const tags = ref(""); // 标签
const coversInput = ref(""); // 封面输入，格式: 封面 || 标题

// 分类相关
const categories = ref<any[]>([]);
const selectedCategoryIds = ref<number[]>([]);

// 标签相关
const tagList = ref<any[]>([]);
const selectedTagIds = ref<number[]>([]);

// 获取分类列表
const fetchCategories = async () => {
  try {
    const res = (await $fetch("/api/admin/categories")) as any[];
    categories.value = res || [];
  } catch (error) {
    console.error("获取分类失败:", error);
  }
};

// 获取标签列表
const fetchTags = async () => {
  try {
    const res = (await $fetch("/api/admin/tags")) as any[];
    tagList.value = res || [];
  } catch (error) {
    console.error("获取标签失败:", error);
  }
};

// 获取文章的分类
const fetchPostCategories = async () => {
  if (!postId.value) return;

  try {
    const res = (await $fetch(`/api/admin/post-categories/${postId.value}`)) as any;
    if (res?.success) {
      selectedCategoryIds.value = res.data.map((c: any) => c.mid);
    }
  } catch (error) {
    console.error("获取文章分类失败:", error);
  }
};

// 获取文章的标签
const fetchPostTags = async () => {
  if (!postId.value) return;

  try {
    const res = (await $fetch(`/api/admin/post-tags/${postId.value}`)) as any;
    if (res?.success) {
      selectedTagIds.value = res.data.map((t: any) => t.mid);
    }
  } catch (error) {
    console.error("获取文章标签失败:", error);
  }
};

// 保存文章分类
const savePostCategories = async () => {
  if (!postId.value) return;

  try {
    await $fetch(`/api/admin/post-categories/${postId.value}`, {
      method: "PUT",
      body: { categoryIds: selectedCategoryIds.value },
    });
  } catch (error) {
    console.error("保存分类失败:", error);
  }
};

// 保存文章标签
const savePostTags = async () => {
  if (!postId.value) return;

  try {
    await $fetch(`/api/admin/post-tags/${postId.value}`, {
      method: "PUT",
      body: { tagIds: selectedTagIds.value },
    });
  } catch (error) {
    console.error("保存标签失败:", error);
  }
};

// 切换分类选择
const toggleCategory = (categoryId: number, checked: boolean) => {
  const index = selectedCategoryIds.value.indexOf(categoryId);
  if (checked && index === -1) {
    selectedCategoryIds.value.push(categoryId);
  } else if (!checked && index > -1) {
    // 检查是否是最后一个分类
    if (selectedCategoryIds.value.length <= 1) {
      toast.error({
        message: "至少需要选择一个分类",
      });
      return;
    }
    selectedCategoryIds.value.splice(index, 1);
  }
};

// 切换标签选择
const toggleTag = (tagId: number, checked: boolean) => {
  const index = selectedTagIds.value.indexOf(tagId);
  if (checked && index === -1) {
    selectedTagIds.value.push(tagId);
  } else if (!checked && index > -1) {
    selectedTagIds.value.splice(index, 1);
  }
};

// 获取已选分类名称
const selectedCategoriesLabel = computed(() => {
  if (selectedCategoryIds.value.length === 0) return "选择分类";
  const names = categories.value.filter(c => selectedCategoryIds.value.includes(c.mid)).map(c => c.name);
  return names.join(", ");
});

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
    const res = (await $fetch(`/api/attachments/list?cid=${postId.value}`)) as any;
    if (res?.success) {
      attachments.value = res.data || [];
    }
  } catch (error) {
    console.error("获取附件失败:", error);
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
  target.value = "";
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
      message: "请先保存文章",
      description: "需要先保存文章后才能上传附件",
    });
    return;
  }

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // 验证文件类型
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"];
      if (!allowedTypes.includes(file.type)) {
        toast.error({
          message: "不支持的文件类型",
          description: file.name,
        });
        continue;
      }

      // 验证文件大小 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error({
          message: "文件过大",
          description: `${file.name} 超过 10MB 限制`,
        });
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);

      // 获取 CSRF token
      const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='))
        ?.split('=')[1];
      if (csrfToken) {
        formData.append('csrfToken', csrfToken);
      }

      try {
        const res = (await $fetch(`/api/attachments/upload?cid=${postId.value}`, {
          method: "POST",
          body: formData,
        })) as any;

        if (res?.success) {
          attachments.value.push(res.data);
          toast.success({
            message: "上传成功",
            description: file.name,
          });
        }
      } catch (error) {
        toast.error({
          message: "上传失败",
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
    // 获取 CSRF token
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrf_token='))
      ?.split('=')[1];

    await $fetch(`/api/attachments/${attachment.id}${csrfToken ? `?csrfToken=${csrfToken}` : ''}`, {
      method: "DELETE",
    });

    attachments.value = attachments.value.filter(a => a.id !== attachment.id);
    toast.success({
      message: "删除成功",
    });
  } catch (error) {
    toast.error({
      message: "删除失败",
    });
  }
};

// 复制链接
const copyLink = async (url: string) => {
  // 判断是否已经是完整的 URL（云存储）
  const isFullUrl = url.startsWith('http://') || url.startsWith('https://');
  const fullUrl = isFullUrl ? url : `${window.location.origin}${url}`;

  try {
    await navigator.clipboard.writeText(fullUrl);
    toast.success({
      message: "已复制链接",
      description: fullUrl,
    });
  } catch {
    toast.error({
      message: "复制失败",
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
      tags.value = post.tags || "";
      status.value = post.status === 1 ? "published" : "draft";

      // 解析封面数据：从 JSON 格式转为输入框格式
      if (post.covers) {
        try {
          const coversArray = JSON.parse(post.covers);
          coversInput.value = coversArray.map((c: any) => `${c.url || c.cover}${c.title ? ` || ${c.title}` : ""}`).join("\n");
        } catch {
          coversInput.value = "";
        }
      } else {
        coversInput.value = "";
      }
      // 格式化发布日期为 datetime-local 输入格式（使用本地时间）
      if (post.create_time) {
        const date = new Date(post.create_time);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        publishDate.value = `${year}-${month}-${day}T${hours}:${minutes}`;
      }

      // 同时获取附件列表和分类
      await Promise.all([fetchAttachments(), fetchPostCategories(), fetchPostTags()]);

      // 保存初始内容用于比较
      await nextTick();
      saveInitialContent();
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

// 保存初始内容
const saveInitialContent = () => {
  initialContent.value = content.value;
  initialTitle.value = title.value;
  initialDescription.value = description.value;
  initialSlug.value = slug.value;
  initialCoversInput.value = coversInput.value;
  initialStatus.value = status.value;
  initialPublishDate.value = publishDate.value;
  initialShowToc.value = showToc.value;
  initialManyCovers.value = manyCovers.value;
  initialCategoryIds.value = [...selectedCategoryIds.value];
  initialTagIds.value = [...selectedTagIds.value];
  hasUnsavedChanges.value = false;
};

// 检查是否有未保存的更改
const checkUnsavedChanges = () => {
  return (
    content.value !== initialContent.value ||
    title.value !== initialTitle.value ||
    description.value !== initialDescription.value ||
    slug.value !== initialSlug.value ||
    coversInput.value !== initialCoversInput.value ||
    status.value !== initialStatus.value ||
    publishDate.value !== initialPublishDate.value ||
    showToc.value !== initialShowToc.value ||
    manyCovers.value !== initialManyCovers.value ||
    JSON.stringify(selectedCategoryIds.value.sort()) !== JSON.stringify(initialCategoryIds.value.sort()) ||
    JSON.stringify(selectedTagIds.value.sort()) !== JSON.stringify(initialTagIds.value.sort())
  );
};

// 监听所有字段变化
watch([
  content,
  title,
  description,
  slug,
  coversInput,
  status,
  publishDate,
  showToc,
  manyCovers,
  selectedCategoryIds,
  selectedTagIds,
], () => {
  hasUnsavedChanges.value = checkUnsavedChanges();
}, { deep: true });

// beforeunload 事件处理
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    e.preventDefault();
    e.returnValue = ""; // Chrome 需要设置 returnValue
    return "";
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

  // 检查是否至少选择了一个分类
  if (selectedCategoryIds.value.length === 0) {
    toast.error({
      message: "至少需要选择一个分类",
    });
    return;
  }

  loading.value = true;

  try {
    // 处理封面数据：从输入框格式转为 JSON
    let coversValue = null;
    if (coversInput.value.trim()) {
      const lines = coversInput.value.trim().split("\n");
      const coversArray = lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const parts = line.split("||");
          if (parts.length === 2) {
            return { url: parts[0].trim(), title: parts[1].trim() };
          } else if (parts.length === 1 && parts[0].trim()) {
            return { url: parts[0].trim(), title: "" };
          }
          return null;
        })
        .filter(c => c !== null);
      if (coversArray.length > 0) {
        coversValue = JSON.stringify(coversArray);
      }
    }

    const body = {
      title: title.value,
      desc: description.value,
      slug: slug.value,
      content: content.value,
      status: status.value === "published" ? 1 : 0,
      manyCovers: manyCovers.value,
      covers: coversValue,
      showToc: showToc.value,
      publishDate: publishDate.value,
      tags: tags.value,
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

      // 保存分类
      await savePostCategories();
      // 保存标签
      await savePostTags();

      // 更新初始内容（保存成功后）
      await nextTick();
      saveInitialContent();
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

// 打开文章查看页面
const openPost = () => {
  if (!postId.value) {
    toast.error({
      message: "请先保存文章",
    });
    return;
  }

  if (selectedCategoryIds.value.length === 0) {
    toast.error({
      message: "请先为文章选择分类",
    });
    return;
  }

  // 获取第一个分类
  const categoryId = selectedCategoryIds.value[0];
  const category = categories.value.find(c => c.mid === categoryId);

  if (!category) {
    toast.error({
      message: "分类信息错误",
    });
    return;
  }

  // 使用 slug 或 cid 构建 URL
  const postSlug = slug.value || postId.value;

  // 构建文章 URL
  const url = `/content/${category.slug}/${postSlug}`;

  // 在新窗口打开
  window.open(url, '_blank');
};

// 页面加载时获取文章数据
onMounted(async () => {
  // 获取 CSRF token
  try {
    await $fetch('/api/csrf/token');
  } catch (error) {
    console.error('获取 CSRF token 失败:', error);
  }

  fetchCategories();
  fetchTags();
  if (isEdit.value) {
    fetchPost();
  } else {
    // 新建文章时，自动填充当前时间（使用本地时间，而非 UTC）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    publishDate.value = `${year}-${month}-${day}T${hours}:${minutes}`;

    // 新建文章时也保存初始内容
    nextTick(() => {
      saveInitialContent();
    });
  }

  // 添加 beforeunload 事件监听器
  window.addEventListener("beforeunload", handleBeforeUnload);
});

// 组件卸载时移除事件监听器
onUnmounted(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
});

// 监听 postId 变化，自动填充 slug
watch(postId, newCid => {
  if (newCid && !slug.value) {
    slug.value = String(newCid);
  }
});
</script>

<template>
  <AdminLayout>
    <!-- 骨架屏 -->
    <div v-if="loading && isEdit" class="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <!-- 左侧主内容区骨架屏 -->
      <div class="flex-1 space-y-4 lg:space-y-6">
        <!-- Tabs 导航骨架屏 -->
        <div class="grid grid-cols-3 gap-2">
          <div class="h-10 bg-muted rounded animate-pulse" />
          <div class="h-10 bg-muted rounded animate-pulse" />
          <div class="h-10 bg-muted rounded animate-pulse" />
        </div>

        <!-- 文章内容骨架屏 -->
        <Card class="overflow-hidden px-0 pt-0">
          <CardContent class="p-4 lg:p-6">
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
      <div class="w-full lg:w-80 space-y-4 lg:space-y-6">
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
    <div v-else class="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <!-- 左侧主内容区 -->
      <div class="flex-1 space-y-4 lg:space-y-6">
        <!-- Tabs 导航 -->
        <Tabs v-model="activeTab" default-value="content">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="content" class="text-sm">
              <Icon name="lucide:file-text" class="mr-1 sm:mr-2 size-4" />
              <span class="hidden sm:inline">文章内容</span>
              <span class="sm:hidden">内容</span>
            </TabsTrigger>
            <TabsTrigger value="settings" class="text-sm">
              <Icon name="lucide:settings" class="mr-1 sm:mr-2 size-4" />
              <span class="hidden sm:inline">文章设置</span>
              <span class="sm:hidden">设置</span>
            </TabsTrigger>
            <TabsTrigger value="attachments" class="text-sm">
              <Icon name="lucide:paperclip" class="mr-1 sm:mr-2 size-4" />
              <span class="hidden sm:inline">附件管理</span>
              <span class="sm:hidden">附件</span>
              <Badge v-if="attachments.length > 0" variant="secondary" class="ml-1 sm:ml-2">
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
                    <span class="text-sm text-muted-foreground">/&lt;category_slug&gt;/</span>
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
                <CardDescription>设置文章封面图片，每行一个封面</CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- 多封面开关 -->
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label>启用多封面</Label>
                    <p class="text-xs text-muted-foreground">开启后可以设置多张封面轮播显示</p>
                  </div>
                  <Switch v-model="manyCovers" />
                </div>

                <!-- 封面输入 -->
                <div class="space-y-2">
                  <Label for="coversInput">封面列表</Label>
                  <Textarea
                    id="coversInput"
                    v-model="coversInput"
                    :rows="4"
                    placeholder="每行一个封面，格式：&#10;封面图片地址 || 标题&#10;&#10;示例：&#10;/uploads/cover1.jpg || 文章封面1&#10;/uploads/cover2.jpg || 文章封面2"
                    class="font-mono text-sm" />
                  <p class="text-xs text-muted-foreground">一行一个封面，使用 || 分隔图片地址和标题。如只有图片地址则不显示标题。</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <!-- 附件管理 Tab -->
          <TabsContent value="attachments" class="mt-6">
            <!-- 隐藏的文件输入 -->
            <input ref="fileInputRef" type="file" class="hidden" accept="image/*,video/*" multiple @change="handleFileChange" />

            <Card>
              <CardHeader>
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle>文章附件</CardTitle>
                    <CardDescription>管理此文章的图片和视频附件</CardDescription>
                  </div>
                  <Button :disabled="uploading" @click="handleFileSelect">
                    <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:upload'" :class="{ 'animate-spin': uploading }" class="mr-2 size-4" />
                    {{ uploading ? `上传中 ${uploadProgress}%` : "上传附件" }}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <!-- 拖拽上传区域 -->
                <div
                  v-if="attachments.length === 0"
                  class="border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer"
                  :class="dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'"
                  @dragover.prevent="dragOver = true"
                  @dragleave.prevent="dragOver = false"
                  @drop.prevent="handleDrop"
                  @click="handleFileSelect">
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
                    @click="handleFileSelect">
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
                  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div
                      v-for="item in attachments"
                      :key="item.id"
                      class="group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      <!-- 预览图 -->
                      <div class="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        <img
                          v-if="item.type === 'image'"
                          :src="item.url"
                          :alt="item.name"
                          class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div v-else class="flex flex-col items-center text-muted-foreground">
                          <Icon name="lucide:film" class="size-12 mb-2" />
                          <span class="text-xs">视频预览</span>
                        </div>
                      </div>

                      <!-- 操作遮罩 -->
                      <div
                        class="absolute inset-0 top-[calc(100%-40px)] bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-1 sm:gap-2 pb-2">
                        <Button variant="secondary" size="sm" class="h-7 text-xs px-2" @click.stop="copyLink(item.url)" title="复制链接">
                          <Icon name="lucide:copy" class="size-3" />
                        </Button>
                        <Button variant="destructive" size="sm" class="h-7 text-xs px-2" @click.stop="deleteAttachment(item)" title="删除">
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
      <div class="w-full lg:w-80 space-y-4 lg:space-y-6">
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
                  <Icon name="lucide:file" class="mr-1 sm:mr-2 size-4" />
                  <span class="text-sm">草稿</span>
                </Button>
                <Button :variant="status === 'published' ? 'default' : 'outline'" class="flex-1" @click="status = 'published'">
                  <Icon name="lucide:globe" class="mr-1 sm:mr-2 size-4" />
                  <span class="text-sm">发布</span>
                </Button>
              </div>
            </div>

            <!-- 发布日期 -->
            <div class="space-y-2">
              <Label for="publishDate">发布日期</Label>
              <Input id="publishDate" v-model="publishDate" type="datetime-local" class="text-sm" />
            </div>

            <!-- 是否展示目录 -->
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <Label class="text-sm">展示目录</Label>
                <p class="text-xs text-muted-foreground">在文章侧边栏显示目录导航</p>
              </div>
              <Switch v-model="showToc" />
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
              <div class="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                <div v-if="categories.length === 0" class="text-sm text-muted-foreground text-center py-4">暂无分类</div>
                <div v-else class="space-y-2">
                  <div v-for="category in categories" :key="category.mid" class="flex items-center space-x-2">
                    <Checkbox
                      :id="`category-${category.mid}`"
                      :model-value="selectedCategoryIds.includes(category.mid)"
                      @update:model-value="checked => toggleCategory(category.mid, checked)" />
                    <Label :for="`category-${category.mid}`" class="text-sm font-normal cursor-pointer flex-1">
                      {{ category.name }}
                      <span class="text-xs text-muted-foreground">({{ category.postCount }})</span>
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 标签设置 -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">标签设置</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <Label>文章标签</Label>
              <div class="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                <div v-if="tagList.length === 0" class="text-sm text-muted-foreground text-center py-4">暂无标签</div>
                <div v-else class="space-y-2">
                  <div v-for="tag in tagList" :key="tag.mid" class="flex items-center space-x-2">
                    <Checkbox
                      :id="`tag-${tag.mid}`"
                      :model-value="selectedTagIds.includes(tag.mid)"
                      @update:model-value="checked => toggleTag(tag.mid, checked)" />
                    <Label :for="`tag-${tag.mid}`" class="text-sm font-normal cursor-pointer flex-1">
                      {{ tag.name }}
                      <span class="text-xs text-muted-foreground">({{ tag.postCount }})</span>
                    </Label>
                  </div>
                </div>
              </div>
              <p class="text-xs text-muted-foreground">标签为可选，文章可以不关联任何标签</p>
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
            <Button variant="outline" class="w-full" size="lg" :disabled="!postId" @click="openPost">
              <Icon name="lucide:eye" class="mr-2 size-4" />
              查看本文章
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </AdminLayout>
</template>
