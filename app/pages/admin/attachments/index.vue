<script setup lang="ts">
import type { AttachmentItem, AttachmentListResponse } from "~/types/apis/admin/attachments";
import type { PageItem, PageListResponse } from "~/types/apis/admin/pages";
import type { AdminPost, AdminPostListResponse } from "~/types/apis/admin/posts";
import type { PublicAttachmentUploadResponse } from "~/types/apis/attachments";
import type { AttachmentUploadOptions } from "~/types/apis/attachments-upload";

const toast = useToast();
const loading = ref(true);
const attachments = ref<AttachmentItem[]>([]);
const selectedType = ref("all");
const searchQuery = ref("");
const csrfToken = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);
const livePhotoInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadProgress = ref(0);
const uploadPosts = ref<AdminPost[]>([]);
const uploadPages = ref<PageItem[]>([]);
const selectedUploadTarget = ref("");

const attachmentTypes = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
];

const uploadTargets = computed(() => [
  ...uploadPosts.value.map(post => ({
    value: String(post.cid),
    label: post.title || `文章 #${post.cid}`,
    type: "文章",
  })),
  ...uploadPages.value.map(pageItem => ({
    value: String(pageItem.cid),
    label: pageItem.title || `页面 #${pageItem.cid}`,
    type: "页面",
  })),
]);


// 分页
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

// 获取附件列表
const fetchAttachments = async () => {
  loading.value = true;
  try {
    // 获取 CSRF token
    const csrfRes = await $fetch("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) {
      csrfToken.value = csrfRes.data.token;
    }

    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
    });
    if (selectedType.value !== "all") {
      params.append("type", selectedType.value);
    }
    if (searchQuery.value) {
      params.append("search", searchQuery.value);
    }

    const res = await $fetch<AttachmentListResponse>(`/api/admin/attachments/all?${params}`);
    if (res?.success) {
      attachments.value = res.data.list || [];
      total.value = res.data.total || 0;
    }
  } catch (error) {
    console.error("获取附件列表失败:", error);
    toast.error({
      message: "获取附件列表失败",
    });
  } finally {
    loading.value = false;
  }
};

const fetchUploadTargets = async () => {
  try {
    const [postsRes, pagesRes] = await Promise.all([
      $fetch<AdminPostListResponse>("/api/admin/posts?pageSize=999"),
      $fetch<PageListResponse>("/api/admin/pages?pageSize=999"),
    ]);
    uploadPosts.value = postsRes.data || [];
    uploadPages.value = pagesRes.data || [];
  } catch (error) {
    console.error("获取上传目标失败:", error);
  }
};

watch([selectedType, searchQuery, page], () => {
  fetchAttachments();
});

// 防抖搜索
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1;
  }, 500);
});

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    image: "图片",
    video: "视频",
  };
  return map[type] || type;
};

const getTypeIcon = (type: string) => {
  const map: Record<string, string> = {
    image: "lucide:image",
    video: "lucide:film",
  };
  return map[type] || "lucide:file";
};

const ensureUploadTarget = () => {
  if (selectedUploadTarget.value) return true;
  toast.error({
    message: "请选择上传归属",
    description: "附件需要关联到文章或页面",
  });
  return false;
};

const handleFileSelect = () => {
  if (!ensureUploadTarget()) return;
  fileInputRef.value?.click();
};

const handleLivePhotoSelect = () => {
  if (!ensureUploadTarget()) return;
  livePhotoInputRef.value?.click();
};

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    await uploadFiles(Array.from(files));
  }
  target.value = "";
};

const handleLivePhotoFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    await uploadFiles(Array.from(files), { livePhoto: true });
  }
  target.value = "";
};

const uploadFiles = async (files: File[], options: AttachmentUploadOptions = {}) => {
  if (!ensureUploadTarget()) return;

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const isLivePhoto = options.livePhoto === true;
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
      if (csrfToken.value) {
        formData.append("csrfToken", csrfToken.value);
      }

      try {
        const res = await $fetch<PublicAttachmentUploadResponse>(`/api/attachments/upload?cid=${selectedUploadTarget.value}`, {
          method: "POST",
          body: formData,
        });

        if (res?.success) {
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
    await fetchAttachments();
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
  }
};

const formatFileSize = (size: string | number) => {
  if (size === "-" || !size) return "-";
  const bytes = Number(size);
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const formatImageDimensions = (item: { width?: number | null; height?: number | null }) => {
  if (!item.width || !item.height) return "-";
  return `${item.width} × ${item.height}`;
};

async function deleteAttachment(item: AttachmentItem) {
  const confirmed = confirm(`确定要删除附件 "${item.name}" 吗？`);
  if (!confirmed) return;

  try {
    await $fetch(`/api/attachments/${item.id}?csrfToken=${csrfToken.value}`, {
      method: "DELETE",
    });
    toast.success({
      message: "删除成功",
    });
    await fetchAttachments();
  } catch (error) {
    console.error("删除附件失败:", error);
    toast.error({
      message: "删除失败",
    });
  }
}

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

onMounted(() => {
  fetchAttachments();
  fetchUploadTargets();
});
</script>

<template>
  <AdminLayout>
    <input ref="fileInputRef" type="file" class="hidden" accept="image/*,video/*" multiple @change="handleFileChange" >
    <input ref="livePhotoInputRef" type="file" class="hidden" accept="image/jpeg,image/jpg" multiple @change="handleLivePhotoFileChange" >

    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
      <div>
        <h2 class="text-2xl font-bold">附件管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理图片和视频附件</p>
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <Select v-model="selectedUploadTarget" :disabled="uploading || uploadTargets.length === 0">
          <SelectTrigger class="w-full sm:w-56">
            <SelectValue placeholder="选择上传归属" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="target in uploadTargets" :key="target.value" :value="target.value">
              {{ target.type }}：{{ target.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button :disabled="uploading || uploadTargets.length === 0" @click="handleLivePhotoSelect">
          <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:aperture'" :class="{ 'animate-spin': uploading }" class="mr-2 size-4" />
          上传实况照片
        </Button>
        <Button :disabled="uploading || uploadTargets.length === 0" @click="handleFileSelect">
          <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:upload'" :class="{ 'animate-spin': uploading }" class="mr-2 size-4" />
          {{ uploading ? `上传中 ${uploadProgress}%` : "上传附件" }}
        </Button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <Card class="mb-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4">
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <Label for="typeFilter" class="whitespace-nowrap">类型:</Label>
          <Select id="typeFilter" v-model="selectedType">
            <SelectTrigger class="w-full sm:w-30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="type in attachmentTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex-1 w-full sm:w-auto">
          <div class="relative">
            <Icon name="lucide:search" class="absolute left-3 top-2.5 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input v-model="searchQuery" placeholder="搜索附件名称..." class="pl-10" />
          </div>
        </div>
        <div class="text-sm text-muted-foreground whitespace-nowrap">共 {{ total }} 个附件</div>
      </div>
    </Card>

    <Card>
      <!-- 加载状态 -->
      <div v-if="loading" class="p-4">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div v-for="i in 10" :key="i" class="space-y-2">
            <div class="aspect-square bg-muted rounded-lg animate-pulse" />
            <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
            <div class="h-3 bg-muted rounded w-1/2 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="attachments.length === 0" class="text-center py-16">
        <Icon name="lucide:paperclip" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground text-lg mb-2">暂无附件</p>
        <p class="text-sm text-muted-foreground mb-4">请选择上传归属后，可直接在本页上传附件</p>
        <Button :disabled="uploadTargets.length === 0" @click="handleFileSelect">
          <Icon name="lucide:upload" class="mr-2 size-4" />
          上传附件
        </Button>
      </div>

      <!-- 附件网格 -->
      <div v-else class="p-4">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div v-for="item in attachments" :key="item.id" class="group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
            <!-- 预览图 -->
            <NuxtLink :to="`/admin/attachments/${item.id}`" class="block">
              <div class="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                <img
                  v-if="item.type === 'image'"
                  :src="item.url"
                  :alt="item.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform" >
                <div v-else class="flex flex-col items-center text-muted-foreground">
                  <Icon :name="getTypeIcon(item.type)" class="size-12 mb-2" />
                  <span class="text-xs">视频预览</span>
                </div>
              </div>
            </NuxtLink>

            <!-- 操作遮罩 -->
            <div
              class="absolute inset-0 top-[calc(100%-60px)] bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-2 pb-2">
              <Button variant="secondary" size="sm" class="h-8" title="复制链接" @click.stop="copyLink(item.url)">
                <Icon name="lucide:copy" class="size-4" />
              </Button>
              <Button variant="secondary" size="sm" class="h-8" title="编辑" @click.stop="navigateTo(`/admin/attachments/${item.id}`)">
                <Icon name="lucide:settings" class="size-4" />
              </Button>
              <Button variant="destructive" size="sm" class="h-8" title="删除" @click.stop="deleteAttachment(item)">
                <Icon name="lucide:trash-2" class="size-4" />
              </Button>
            </div>

            <!-- 信息 -->
            <div class="p-3">
              <p class="text-sm font-medium truncate" :title="item.name">
                {{ item.name }}
              </p>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted-foreground">
                <Badge variant="outline" class="text-xs">
                  {{ getTypeLabel(item.type) }}
                </Badge>
                <span>{{ formatFileSize(item.size) }}</span>
                <span v-if="item.type === 'image'">{{ formatImageDimensions(item) }}</span>
              </div>
              <div v-if="item.post" class="mt-1">
                <NuxtLink :to="`/admin/posts/edit?cid=${item.post.cid}`" class="text-xs text-muted-foreground hover:text-foreground">
                  {{ item.post.title }}
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="total > pageSize" class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-6">
          <Button variant="outline" size="sm" :disabled="page === 1" @click="page--"> 上一页 </Button>
          <span class="text-sm text-muted-foreground"> 第 {{ page }} / {{ Math.ceil(total / pageSize) }} 页 </span>
          <Button variant="outline" size="sm" :disabled="page >= Math.ceil(total / pageSize)" @click="page++"> 下一页 </Button>
        </div>
      </div>
    </Card>

    <!-- 使用提示 -->
    <Card class="mt-4 bg-muted/50">
      <CardContent class="p-4">
        <div class="flex items-start gap-3">
          <Icon name="lucide:info" class="size-5 text-muted-foreground mt-0.5" />
          <div class="text-sm text-muted-foreground">
            <p class="font-medium text-foreground mb-1">附件使用说明</p>
            <ul class="space-y-1 list-disc list-inside">
              <li>先选择上传归属，可在本页直接上传普通附件或实况照片</li>
              <li>普通附件支持 JPG、PNG、GIF、WebP、MP4、WebM，最大 10MB</li>
              <li>实况照片请使用专用入口上传 JPEG，最大 50MB，上传时保留原文件不转格式</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>
