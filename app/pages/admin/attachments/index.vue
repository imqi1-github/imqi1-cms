<script setup lang="ts">
import type { InternalApi } from "nitropack/types";

type AttachmentItem = NonNullable<NonNullable<InternalApi["/api/admin/attachments/all"]["get"]["data"]>["list"]>[number];

const toast = useToast();
const loading = ref(true);
const attachments = ref<AttachmentItem[]>([]);
const selectedType = ref("all");
const searchQuery = ref("");
const csrfToken = ref("");

const attachmentTypes = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
];

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

    const res = await $fetch(`/api/admin/attachments/all?${params}`);
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

// 监听筛选条件变化
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

const formatFileSize = (size: string | number) => {
  if (size === "-" || !size) return "-";
  const bytes = Number(size);
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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
});
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">附件管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理图片和视频附件</p>
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
        <p class="text-sm text-muted-foreground mb-4">前往文章编辑页面上传附件</p>
        <Button @click="navigateTo('/admin/posts')">
          <Icon name="lucide:file-text" class="mr-2 size-4" />
          前往文章管理
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
              <div class="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <Badge variant="outline" class="text-xs">
                  {{ getTypeLabel(item.type) }}
                </Badge>
                <span>{{ formatFileSize(item.size) }}</span>
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
              <li>附件需要关联到文章才能上传，请前往文章编辑页面</li>
              <li>点击附件可以查看详情和编辑信息</li>
              <li>悬停在附件上可以快速复制链接、编辑或删除</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>
