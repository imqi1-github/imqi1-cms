<script setup lang="ts">
import type { PublicAttachment, PublicAttachmentListResponse, PublicAttachmentUploadResponse } from "~/types/apis/attachments";
import type { AttachmentUploadOptions } from "~/types/apis/attachments-upload";
import type { ContentDetailResponse } from "~/types/apis/admin/pages";
import type { ContentSaveResponse, CoversInput } from "~/types/apis/admin/contents";
import type { CsrfResponse } from "~/types/apis/admin/categories";
import type { ApiError } from "~/types/error";
import { isSpecialPageSlug, SPECIAL_PAGE_OPTIONS, type SpecialPageValue } from "#shared/special-pages";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();

// 判断是新建还是编辑
const isEdit = computed(() => !!route.query.cid);
const pageId = ref<number | null>(null);
watch(() => route.query.cid, (newCid) => {
  // 对齐 contents/edit.vue：cid 必须为正整数，坏值置 null（否则 NaN 拼 URL / 骨架屏卡死）
  const parsed = newCid ? Number(newCid) : NaN;
  pageId.value = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}, { immediate: true });

const activeTab = ref("content");
// 编辑页首帧即给骨架屏：isEdit 在 SSR 时即可由 route.query.cid 判定，loading 初始即 true，
// 避免先渲染空编辑器再切骨架再灌内容的三段式闪烁；新建页 isEdit=false → 直接显示空编辑器
const loading = ref(isEdit.value && !!pageId.value);
const csrfToken = ref("");

// 跟踪是否有未保存的更改
const hasUnsavedChanges = ref(false);
const initialTitle = ref("");
const initialSlug = ref("");
const initialContent = ref("");
const initialDesc = ref("");
const initialShowToc = ref(false);
const initialStatus = ref(1);
const initialManyCovers = ref(false);
const initialCoversInput = ref("");

// 表单数据
const title = ref("");
const pageType = ref<SpecialPageValue>("messages");
const customSlug = ref("");
const slug = computed(() => (pageType.value === "custom" ? customSlug.value.trim() : pageType.value));
const content = ref("");
const desc = ref("");
const showToc = ref(false);
const status = ref(1); // 0: 草稿, 1: 已发布
const manyCovers = ref(false);
const coversInput = ref(""); // 封面输入，格式: 封面 || 标题

// 附件相关
const attachments = ref<PublicAttachment[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const livePhotoInputRef = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const uploading = ref(false);
const uploadProgress = ref(0);

// 格式化文件大小
function formatFileSize(bytes: number) {
  if (!bytes || bytes === 0) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// 获取附件列表
const fetchAttachments = async () => {
  if (!pageId.value) return;

  try {
    const res = await $fetch<PublicAttachmentListResponse>(`/api/attachments/list?cid=${pageId.value}`);
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

// 选择实况照片
const handleLivePhotoSelect = () => {
  livePhotoInputRef.value?.click();
};

// 处理文件选择
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    await uploadFiles(Array.from(files));
  }
  target.value = "";
};

// 处理实况照片选择
const handleLivePhotoFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    await uploadFiles(Array.from(files), { livePhoto: true });
  }
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
const uploadFiles = async (files: File[], options: AttachmentUploadOptions = {}) => {
  if (!pageId.value) {
    toast.error({
      message: "请先保存页面",
      description: "需要先保存页面后才能上传附件",
    });
    return;
  }

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const isLivePhoto = options.livePhoto === true;

      // 验证文件类型
      const allowedTypes = isLivePhoto
        ? ["image/jpeg", "image/jpg"]
        : ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"];
      if (!allowedTypes.includes(file.type)) {
        toast.error({
          message: isLivePhoto ? "实况照片仅支持 JPEG" : "不支持的文件类型",
          description: file.name,
        });
        continue;
      }

      // 验证文件大小：普通附件 10MB，实况照片 50MB
      const maxSize = isLivePhoto ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error({
          message: "文件过大",
          description: `${file.name} 超过 ${maxSize / 1024 / 1024}MB 限制`,
        });
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);
      if (isLivePhoto) {
        formData.append("livePhoto", "true");
      }

      // CSRF token（统一用加载时取的 ref）
      if (csrfToken.value) {
        formData.append('csrfToken', csrfToken.value);
      }

      try {
        const res = await $fetch<PublicAttachmentUploadResponse>(`/api/attachments/upload?cid=${pageId.value}`, {
          method: "POST",
          body: formData,
        });

        if (res?.success) {
          attachments.value.push(res.data);
          toast.success({
            message: isLivePhoto ? "实况照片上传成功" : "上传成功",
            description: file.name,
          });
        }
      } catch {
        toast.error({
          message: isLivePhoto ? "实况照片上传失败" : "上传失败",
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

// 取消关联附件
const deleteAttachment = async (attachment: PublicAttachment) => {
  const confirmed = await confirm({
    title: "取消关联附件",
    description: `确定要取消关联附件 "${attachment.name}" 吗？`,
    variant: "destructive",
    confirmText: "确认取消关联",
    icon: "lucide:unlink",
  });
  if (!confirmed) return;
  if (!pageId.value) return;

  try {
    const params = new URLSearchParams({ cid: String(pageId.value) });

    await $fetch(`/api/attachments/${attachment.id}?${params}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken.value },
    });

    attachments.value = attachments.value.filter(a => a.id !== attachment.id);
    toast.success({
      message: "已取消关联",
    });
  } catch {
    toast.error({
      message: "取消关联失败",
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

// 保存初始内容（作为未保存判定的基线）
const saveInitialContent = () => {
  initialTitle.value = title.value;
  initialSlug.value = slug.value;
  initialContent.value = content.value;
  initialDesc.value = desc.value;
  initialShowToc.value = showToc.value;
  initialStatus.value = status.value;
  initialManyCovers.value = manyCovers.value;
  initialCoversInput.value = coversInput.value;
  hasUnsavedChanges.value = false;
};

// 检查是否有未保存的更改
const checkUnsavedChanges = () => (
  title.value !== initialTitle.value ||
  slug.value !== initialSlug.value ||
  content.value !== initialContent.value ||
  desc.value !== initialDesc.value ||
  showToc.value !== initialShowToc.value ||
  status.value !== initialStatus.value ||
  manyCovers.value !== initialManyCovers.value ||
  coversInput.value !== initialCoversInput.value
);

// 监听所有字段变化
watch([
  title,
  slug,
  content,
  desc,
  showToc,
  status,
  manyCovers,
  coversInput,
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

// 获取页面数据
const fetchPage = async () => {
  if (!pageId.value) return;

  loading.value = true;
  try {
    const res = await $fetch<ContentDetailResponse>(`/api/admin/contents/${pageId.value}`);
    if (res?.data) {
      const page = res.data;
      // 页面编辑器只应编辑 type=1 的记录；命中文章(type=0)则跳文章编辑器，避免保存时把文章转成页面
      if (page.type !== 1) {
        toast.error({ message: "这不是一个页面，请使用文章编辑器编辑" });
        return await navigateTo(`/admin/contents/edit?cid=${pageId.value}`, { replace: true });
      }
      title.value = page.title || "";
      // slug 由 pageType+customSlug 推导：命中预设选类型，否则归为「自定义」并回填自由输入
      const ps = page.slug || "";
      if (isSpecialPageSlug(ps)) { pageType.value = ps; customSlug.value = ""; }
      else { pageType.value = "custom"; customSlug.value = ps; }
      content.value = page.content || "";
      desc.value = page.desc || "";
      showToc.value = page.show_toc || false;
      status.value = page.status ?? 1;
      manyCovers.value = page.many_covers || false;

      // 解析封面数据：从 JSON 格式转为输入框格式
      if (page.covers) {
        try {
          const coversArray = JSON.parse(page.covers) as CoversInput[];
          coversInput.value = coversArray
            .map(c => `${c.url || c.cover}${c.title ? ` || ${c.title}` : ''}`)
            .join('\n');
        } catch {
          coversInput.value = "";
        }
      } else {
        coversInput.value = "";
      }

      // 获取附件
      await fetchAttachments();

      // 保存初始内容（作为未保存判定的基线）
      await nextTick();
      saveInitialContent();
    }
  } catch (error) {
    console.error("获取页面失败:", error);
    toast.error({
      message: "获取页面失败",
    });
  } finally {
    loading.value = false;
  }
};

// 保存页面
const savePage = async () => {
  if (loading.value) return;
  if (!title.value.trim()) {
    toast.error({
      message: "请输入页面标题",
    });
    return;
  }

  loading.value = true;
  try {
    // 处理封面数据：从输入框格式转为 JSON
    let coversValue = null;
    if (coversInput.value.trim()) {
      const lines = coversInput.value.trim().split('\n');
      const coversArray = lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const [urlPart, ...titleParts] = line.split('||');
          const url = (urlPart || '').trim();
          if (!url) return null;
          return { url, title: titleParts.join('||').trim() };
        })
        .filter(c => c !== null);
      if (coversArray.length > 0) {
        coversValue = JSON.stringify(coversArray);
      }
    }

    const body = {
      title: title.value.trim(),
      slug: slug.value?.trim() || null,
      content: content.value,
      desc: desc.value,
      show_toc: showToc.value,
      status: status.value,
      type: 1, // 1: 页面
      manyCovers: manyCovers.value,
      covers: coversValue,
      csrfToken: csrfToken.value,
    };

    let res: ContentSaveResponse | undefined;
    if (isEdit.value && pageId.value) {
      // 更新
      res = await $fetch<ContentSaveResponse>(`/api/admin/contents/${pageId.value}`, {
        method: "PUT",
        body,
      });
    } else {
      // 新建
      res = await $fetch<ContentSaveResponse>("/api/admin/contents", {
        method: "POST",
        body,
      });
    }

    if (res) {
      toast.success({
        message: isEdit.value ? "页面已更新" : "页面已创建",
      });

      // 如果是新建且成功，跳转到编辑页面
      if (!isEdit.value && res.data?.cid) {
        const newCid = res.data.cid;
        pageId.value = newCid;
        await fetchAttachments();
        await router.replace(`/admin/pages/edit?cid=${newCid}`);
      }

      // 保存成功后更新基线
      await nextTick();
      saveInitialContent();
    }
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    const message = error?.data?.message || error?.message || "保存失败";
    toast.error({
      message,
    });
  } finally {
    loading.value = false;
  }
};

// 取消
const cancel = () => {
  router.push("/admin/pages");
};

// 快捷键
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl/Cmd + S 保存
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    savePage();
  }
};

onMounted(async () => {
  // 获取 CSRF token（保存/删除附件写入接口需要）
  try {
    const csrfRes = await $fetch<CsrfResponse>('/api/csrf/token', { credentials: "include" });
    if (csrfRes?.data?.token) csrfToken.value = csrfRes.data.token;
  } catch (error) {
    console.error('获取 CSRF token 失败:', error);
  }

  if (isEdit.value) {
    fetchPage();
  }
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("beforeunload", handleBeforeUnload);
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

        <!-- 内容骨架屏 -->
        <Card class="overflow-hidden p-0">
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
          <TabsList class="grid w-full grid-cols-4">
            <TabsTrigger value="content" class="text-sm">
              <Icon name="lucide:file-text" class="mr-1 sm:mr-2 size-4" />
              <span class="hidden sm:inline">富文本</span>
              <span class="sm:hidden">富文本</span>
            </TabsTrigger>
            <TabsTrigger value="md" class="text-sm">
              <Icon name="lucide:code" class="mr-1 sm:mr-2 size-4" />
              <span class="hidden sm:inline">Markdown</span>
              <span class="sm:hidden">MD</span>
            </TabsTrigger>
            <TabsTrigger value="settings" class="text-sm">
              <Icon name="lucide:settings" class="mr-1 sm:mr-2 size-4" />
              <span class="hidden sm:inline">页面设置</span>
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

          <!-- 富文本 / Markdown 源码：单个编辑器实例，由 activeTab（顶层 tab）驱动视图模式 -->
          <div v-show="activeTab === 'content' || activeTab === 'md'" class="mt-6">
            <Card class="overflow-hidden p-0!">
              <CardContent class="p-0!">
                <MarkdownEditor
                  v-model="content"
                  :content-id="pageId ?? undefined"
                  :view-mode="activeTab === 'md' ? 'md' : 'rich'"
                  @attachment-updated="fetchAttachments"
                />
              </CardContent>
            </Card>
          </div>

          <!-- 页面设置 Tab -->
          <TabsContent value="settings" class="mt-6 space-y-6">
            <!-- 基本信息 -->
            <Card>
              <CardHeader>
                <CardTitle>基本信息</CardTitle>
                <CardDescription>设置页面的基本属性</CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- 标题 -->
                <div class="space-y-2">
                  <Label for="page-title">页面标题</Label>
                  <Input id="page-title" v-model="title" placeholder="请输入页面标题" class="text-lg font-medium" />
                </div>

                <!-- 描述 -->
                <div class="space-y-2">
                  <Label for="page-desc">页面描述</Label>
                  <Textarea id="page-desc" v-model="desc" placeholder="请输入页面描述，用于 SEO 和分享" :rows="2" />
                </div>

                <!-- Slug：预设特殊页面下拉；选「自定义」时可自由输入（前台仍 404，未实现） -->
                <div class="space-y-2">
                  <Label for="page-slug">页面 Slug</Label>
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-muted-foreground">特殊页面：</span>
                    <Select v-model="pageType" class="flex-1">
                      <SelectTrigger id="page-slug" class="flex-1">
                        <SelectValue placeholder="选择特殊页面" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="option in SPECIAL_PAGE_OPTIONS" :key="option.value" :value="option.value">
                          {{ option.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <!-- 自定义：自由输入 slug（未实现，前台访问返回 404） -->
                  <div v-if="pageType === 'custom'" class="flex items-center gap-2">
                    <span class="text-sm text-muted-foreground">自定义 Slug：</span>
                    <Input v-model="customSlug" placeholder="输入自定义 slug，如 about" class="flex-1" />
                  </div>
                  <p class="text-xs text-muted-foreground">
                    「留言板」对应 <code class="bg-muted px-1 py-0.5 rounded">/messages</code>，「协议」对应
                    <code class="bg-muted px-1 py-0.5 rounded">/agreement</code>；「自定义」暂未实现，
                    保存后前台访问会返回 404（等真正支持自定义页面后再启用）。
                  </p>
                </div>
              </CardContent>
            </Card>

            <!-- 封面设置 -->
            <Card>
              <CardHeader>
                <CardTitle>封面设置</CardTitle>
                <CardDescription>设置页面封面图片，每行一个封面</CardDescription>
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
                    placeholder="每行一个封面，格式：&#10;封面图片地址 || 标题&#10;&#10;示例：&#10;/uploads/cover1.jpg || 页面封面1&#10;/uploads/cover2.jpg || 页面封面2"
                    class="font-mono text-sm"
                  />
                  <p class="text-xs text-muted-foreground">
                    一行一个封面，使用 || 分隔图片地址和标题。如只有图片地址则不显示标题。
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <!-- 附件管理 Tab -->
          <TabsContent value="attachments" class="mt-6">
            <!-- 隐藏的文件输入 -->
            <input ref="fileInputRef" type="file" class="hidden" accept="image/*,video/*" multiple @change="handleFileChange" >
            <input ref="livePhotoInputRef" type="file" class="hidden" accept="image/jpeg,image/jpg" multiple @change="handleLivePhotoFileChange" >

            <Card>
              <CardHeader>
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle>页面附件</CardTitle>
                    <CardDescription>管理此页面的图片和视频附件</CardDescription>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <Button :disabled="uploading" @click="handleLivePhotoSelect">
                      <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:aperture'" :class="{ 'animate-spin': uploading }" class="mr-2 size-4" />
                      上传实况照片
                    </Button>
                    <Button :disabled="uploading" @click="handleFileSelect">
                      <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:upload'" :class="{ 'animate-spin': uploading }" class="mr-2 size-4" />
                      {{ uploading ? `上传中 ${uploadProgress}%` : "上传附件" }}
                    </Button>
                  </div>
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
                  <p class="text-xs text-muted-foreground">支持 JPG、PNG、GIF、WebP、MP4、WebM，最大 10MB；实况照片请点专用入口上传 JPEG，最大 50MB，保留原文件不转格式</p>
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
                    <p class="text-xs text-muted-foreground mt-1">实况照片请使用上方专用入口，上传时不转格式</p>
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
                          class="w-full h-full object-cover group-hover:scale-105 transition-transform" >
                        <div v-else class="flex flex-col items-center text-muted-foreground">
                          <Icon name="lucide:film" class="size-12 mb-2" />
                          <span class="text-xs">视频预览</span>
                        </div>
                      </div>

                      <!-- 操作遮罩 -->
                      <div
                        class="absolute inset-0 top-[calc(100%-40px)] bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-1 sm:gap-2 pb-2">
                        <Button variant="secondary" size="sm" class="h-7 text-xs px-2" title="复制链接" @click.stop="copyLink(item.url)">
                          <Icon name="lucide:copy" class="size-3" />
                        </Button>
                        <Button variant="destructive" size="sm" class="h-7 text-xs px-2" title="取消关联" @click.stop="deleteAttachment(item)">
                          <Icon name="lucide:unlink" class="size-3" />
                        </Button>
                      </div>

                      <!-- 信息 -->
                      <div class="p-2">
                        <p class="text-xs font-medium truncate" :title="item.name">
                          {{ item.name }}
                        </p>
                        <p class="text-xs text-muted-foreground">{{ formatFileSize(item.size) }}</p>
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
                      <li>上传的附件可以插入到页面内容中</li>
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
                <Button :variant="status === 0 ? 'default' : 'outline'" class="flex-1" @click="status = 0">
                  <Icon name="lucide:file" class="mr-1 sm:mr-2 size-4" />
                  <span class="text-sm">草稿</span>
                </Button>
                <Button :variant="status === 1 ? 'default' : 'outline'" class="flex-1" @click="status = 1">
                  <Icon name="lucide:globe" class="mr-1 sm:mr-2 size-4" />
                  <span class="text-sm">发布</span>
                </Button>
              </div>
            </div>

            <!-- 是否展示目录 -->
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <Label class="text-sm">展示目录</Label>
                <p class="text-xs text-muted-foreground">在页面侧边栏显示目录导航</p>
              </div>
              <Switch v-model="showToc" />
            </div>
          </CardContent>
        </Card>

        <!-- 操作按钮 -->
        <Card>
          <CardContent class="pt-6 space-y-2">
            <Button class="w-full" size="lg" :disabled="loading" @click="savePage">
              <Icon name="lucide:save" class="mr-2 size-4" />
              {{ loading ? "保存中..." : "保存页面" }}
            </Button>
            <Button variant="outline" class="w-full" size="lg" @click="cancel">
              <Icon name="lucide:x" class="mr-2 size-4" />
              取消
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </AdminLayout>
</template>
