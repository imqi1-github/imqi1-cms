<script setup lang="ts">
import type { AttachmentItem, AttachmentListResponse, ImageDimension } from "~/types/apis/admin/attachments";
import type { PublicAttachmentUploadResponse } from "~/types/apis/attachments";
import type { AttachmentUploadOptions } from "~/types/apis/attachments-upload";

const toast = useToast();
const { confirm } = useConfirm();
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const attachments = ref<AttachmentItem[]>([]);
const selectedType = ref("all");
const searchQuery = ref("");
const csrfToken = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);
const livePhotoInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadProgress = ref(0);

const attachmentTypes = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
];

// 分页（页码从 URL query 读取，从详情页返回时仍停留在原页）
const page = ref(Math.max(1, Number(route.query.page) || 1));
const pageSize = ref(20);
const total = ref(0);

// 请求序号守卫：只认最后一次发起的请求，丢弃过期响应（防异步乱序覆盖新结果）
let fetchSeq = 0;

// 获取附件列表
const fetchAttachments = async () => {
  const seq = ++fetchSeq;
  loading.value = true;
  try {
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
    if (seq !== fetchSeq) return; // 已有更新的请求，丢弃本次结果

    if (res?.success) {
      attachments.value = res.data.list || [];
      total.value = res.data.total || 0;

      // 删除/陈旧 URL 可能让当前页越界返回空（如删光最后一页）：跳到最后一页重取，
      // 由下方 [selectedType, page] watch 触发实际拉取。
      const totalPages = Math.ceil(total.value / pageSize.value);
      if (attachments.value.length === 0 && total.value > 0 && page.value > totalPages) {
        page.value = Math.max(1, totalPages);
      }
    }
  } catch (error) {
    console.error("获取附件列表失败:", error);
    toast.error({
      message: "获取附件列表失败",
    });
  } finally {
    if (seq === fetchSeq) loading.value = false;
  }
};

// 类型筛选 / 分页变化时立即拉取（不防抖）
watch([selectedType, page], () => {
  fetchAttachments();
  syncPageQuery();
});

// 搜索防抖：停止输入 500ms 后才重置到第 1 页并拉取，避免每次按键都请求
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (page.value === 1) {
      // 已在第 1 页，page 变化不会触发 page watch，需显式拉一次
      fetchAttachments();
      syncPageQuery();
    } else {
      page.value = 1; // 触发 [selectedType, page] watch 拉取
    }
  }, 500);
});

// 把当前页码写回 URL（page=1 时省略，保持地址栏干净）
function syncPageQuery() {
  const want = page.value !== 1 ? String(page.value) : undefined;
  const current = typeof route.query.page === "string" ? route.query.page : undefined;
  if (current !== want) {
    router.replace({ query: { ...route.query, page: want } });
  }
}

// 进入详情时携带当前页码，供详情页"返回"按钮回到原页
const detailRoute = (id: number | string) => ({
  path: `/admin/attachments/${id}`,
  query: page.value !== 1 ? { page: String(page.value) } : {},
});

const displayedContents = (item: AttachmentItem) => item.contents.slice(0, 2);
const hiddenContentCount = (item: AttachmentItem) => Math.max(0, item.contents.length - 2);

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

const handleFileSelect = () => {
  fileInputRef.value?.click();
};

const handleLivePhotoSelect = () => {
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
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
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
        const res = await $fetch<PublicAttachmentUploadResponse>("/api/attachments/upload", {
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

const formatImageDimensions = (item: ImageDimension) => {
  if (!item.width || !item.height) return "-";
  return `${item.width} × ${item.height}`;
};

async function deleteAttachment(item: AttachmentItem) {
  const confirmed = await confirm({
    title: "删除附件",
    description: `确定要删除附件 "${item.name}" 吗？`,
    variant: "destructive",
    confirmText: "确认删除",
    icon: "lucide:trash-2",
  });
  if (!confirmed) return;
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }

  try {
    await $fetch(`/api/attachments/${item.id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken.value },
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
  const isFullUrl = url.startsWith("http://") || url.startsWith("https://");
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

onMounted(async () => {
  // 获取 CSRF token（写接口用；GET 列表不需要，仅拉一次）
  try {
    const csrfRes = await $fetch("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) {
      csrfToken.value = csrfRes.data.token;
    }
  } catch (error) {
    console.error("获取 CSRF token 失败:", error);
  }
  fetchAttachments();
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

    <ClientOnly>
      <!-- 筛选栏 -->
      <Card class="mb-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
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
          <div class="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
          <p class="text-sm text-muted-foreground mb-4">可直接在本页上传附件，之后可在附件详情页关联文章或页面</p>
          <Button @click="handleFileSelect">
            <Icon name="lucide:upload" class="mr-2 size-4" />
            上传附件
          </Button>
        </div>

        <!-- 附件网格 -->
        <div v-else>
          <div class="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div
              v-for="item in attachments"
              :key="item.id"
              class="group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              <!-- 预览图 -->
              <NuxtLink :to="detailRoute(item.id)" class="block">
                <div class="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  <img
                    v-if="item.type === 'image'"
                    :src="item.url"
                    :alt="item.name"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform">
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
                <Button variant="secondary" size="sm" class="h-8" title="编辑" @click.stop="navigateTo(detailRoute(item.id))">
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
                <div v-if="item.contents.length > 0" class="mt-1 flex flex-wrap items-center gap-1">
                  <NuxtLink
                    v-for="content in displayedContents(item)"
                    :key="content.cid"
                    :to="`/admin/contents/edit?cid=${content.cid}`"
                    class="max-w-full truncate text-xs text-muted-foreground hover:text-foreground">
                    {{ content.title }}
                  </NuxtLink>
                  <span v-if="hiddenContentCount(item)" class="text-xs text-muted-foreground"> +{{ hiddenContentCount(item) }} </span>
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

      <template #fallback>
        <Card class="mb-4">
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <Label class="whitespace-nowrap">类型:</Label>
              <div class="h-9 w-full rounded-md border bg-muted/50 sm:w-30" />
            </div>
            <div class="flex-1 w-full sm:w-auto">
              <div class="h-9 rounded-md border bg-muted/50" />
            </div>
            <div class="h-5 w-20 rounded bg-muted/70" />
          </div>
        </Card>

        <Card>
          <div class="p-4">
            <div class="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <div v-for="i in 10" :key="i" class="space-y-2">
                <div class="aspect-square bg-muted rounded-lg animate-pulse" />
                <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
                <div class="h-3 bg-muted rounded w-1/2 animate-pulse" />
              </div>
            </div>
          </div>
        </Card>
      </template>
    </ClientOnly>

    <!-- 使用提示 -->
    <Card class="mt-4 bg-muted/50">
      <CardContent class="p-4">
        <div class="flex items-start gap-3">
          <Icon name="lucide:info" class="size-5 text-muted-foreground mt-0.5" />
          <div class="text-sm text-muted-foreground">
            <p class="font-medium text-foreground mb-1">附件使用说明</p>
            <ul class="space-y-1 list-disc list-inside">
              <li>可在本页直接上传普通附件或实况照片，上传后默认不关联文章/页面</li>
              <li>普通附件支持 JPG、PNG、GIF、WebP、MP4、WebM，最大 10MB</li>
              <li>实况照片请使用专用入口上传 JPEG，最大 50MB，上传时保留原文件不转格式</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>
