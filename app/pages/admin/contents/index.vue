<script setup lang="ts">
import type {AcceptableValue} from "reka-ui";

import type {AdminContent, AdminContentListResponse, Category, Tag} from "~/types/apis/admin/contents";
import type { CsrfResponse } from "~/types/apis/admin/categories";

const router = useRouter();
const route = useRoute();
const toast = useToast();
const { confirm } = useConfirm();
const csrfToken = ref("");
const loading = ref(true);
const contents = ref<AdminContent[]>([]);
const categories = ref<Category[]>([]);
const tags = ref<Tag[]>([]);
const selectedCategory = ref<number | null>(null);
const selectedTag = ref<number | null>(null);
const selectedStatus = ref<number | null>(null);
const selectedIds = ref<number[]>([]);
const deleting = ref(false);
const fetchSeq = ref(0);
const pagination = ref({
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
});

const statusOptions = [
  { value: null, label: "全部状态" },
  { value: 1, label: "已发布" },
  { value: 0, label: "草稿" },
];

const isAllSelected = computed(() => {
  return contents.value.length > 0 && selectedIds.value.length === contents.value.length;
});

const isIndeterminate = computed(() => {
  return selectedIds.value.length > 0 && selectedIds.value.length < contents.value.length;
});

const pageRange = computed(() => {
  const totalPages = pagination.value.totalPages;
  const current = pagination.value.page;
  const range: (number | string)[] = [];

  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= totalPages; i++) {
      range.push(i);
    }
  } else {
    // Always show first page
    range.push(1);

    if (current <= 3) {
      // Near the start: 1 2 3 4 5 ... 10
      for (let i = 2; i <= 5; i++) {
        range.push(i);
      }
      range.push("...");
      range.push(totalPages);
    } else if (current >= totalPages - 2) {
      // Near the end: 1 ... 6 7 8 9 10
      range.push("...");
      for (let i = totalPages - 4; i <= totalPages; i++) {
        range.push(i);
      }
    } else {
      // Middle: 1 ... 4 5 6 ... 10
      range.push("...");
      for (let i = current - 1; i <= current + 1; i++) {
        range.push(i);
      }
      range.push("...");
      range.push(totalPages);
    }
  }

  return range;
});

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = [];
  } else {
    selectedIds.value = contents.value.map(p => p.cid);
  }
}

function toggleSelect(cid: number) {
  const index = selectedIds.value.indexOf(cid);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(cid);
  }
}

async function fetchCategories() {
  try {
    categories.value = await $fetch<Category[]>("/api/admin/categories");
  } catch (error) {
    console.error("获取分类失败:", error);
    categories.value = [];
  }
}

async function fetchTags() {
  try {
    tags.value = await $fetch<Tag[]>("/api/admin/tags");
  } catch (error) {
    console.error("获取标签失败:", error);
    tags.value = [];
  }
}

async function fetchContents(page: number = 1, updateUrl: boolean = true) {
  page = Math.max(1, page);
  const seq = ++fetchSeq.value;
  loading.value = true;
  selectedIds.value = [];
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: "10",
    });

    if (selectedCategory.value) {
      params.append("category", selectedCategory.value.toString());
    }

    if (selectedTag.value) {
      params.append("tag", selectedTag.value.toString());
    }

    if (selectedStatus.value !== null) {
      params.append("status", selectedStatus.value.toString());
    }

    const res = await $fetch<AdminContentListResponse>(`/api/admin/contents?${params.toString()}`);
    if (seq !== fetchSeq.value) return;
    contents.value = res.data || [];
    pagination.value = res.pagination || pagination.value;

    // 删除/陈旧 URL 可能让请求页越界而返回空（如删光最后一页后 page 超出新 totalPages）：
    // 直接跳到最后一页，避免停留在空列表/越界页码（一次性跳转，不逐页回退）。
    if (contents.value.length === 0 && pagination.value.totalPages > 0 && pagination.value.page > pagination.value.totalPages) {
      return fetchContents(pagination.value.totalPages, updateUrl);
    }

    // 更新 URL（如果需要）
    if (updateUrl) {
      const query: Record<string, string> = {};
      if (page > 1) query.page = page.toString();
      if (selectedCategory.value) query.category = selectedCategory.value.toString();
      if (selectedTag.value) query.tag = selectedTag.value.toString();
      if (selectedStatus.value !== null) query.status = selectedStatus.value.toString();
      await router.push({ query });
    }
  } catch (error) {
    if (seq !== fetchSeq.value) return;
    console.error("获取文章失败:", error);
    contents.value = [];
  } finally {
    if (seq === fetchSeq.value) {
      loading.value = false;
    }
  }
}

function filterByCategory(categoryId: number | null) {
  selectedCategory.value = categoryId;
  fetchContents(1);
}

function filterByTag(tagId: number | null) {
  selectedTag.value = tagId;
  fetchContents(1);
}

function filterByStatus(status: number | null) {
  selectedStatus.value = status;
  fetchContents(1);
}

function clearFilters() {
  selectedCategory.value = null;
  selectedTag.value = null;
  selectedStatus.value = null;
  fetchContents(1);
}

async function deleteContent(cid: number) {
  if (deleting.value) return;
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  const confirmed = await confirm({
    title: "删除文章",
    description: "确定要删除这篇文章吗？",
    variant: "destructive",
    confirmText: "确认删除",
    icon: "lucide:trash-2",
  });
  if (confirmed) {
    deleting.value = true;
    try {
      await $fetch(`/api/admin/contents/${cid}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken.value } });
      await fetchContents(pagination.value.page, false);
      toast.success({ message: "文章已删除" });
    } catch (error) {
      console.error("删除失败:", error);
      toast.error({ message: "删除失败" });
    } finally {
      deleting.value = false;
    }
  }
}

async function batchDelete() {
  if (selectedIds.value.length === 0) {
    toast.error({ message: "请选择要删除的文章" });
    return;
  }

  const confirmed = await confirm({
    title: "批量删除文章",
    description: `确定要删除选中的 ${selectedIds.value.length} 篇文章吗？`,
    variant: "destructive",
    confirmText: "确认删除",
    icon: "lucide:trash-2",
  });
  if (confirmed) {
    if (!csrfToken.value) {
      toast.error({ message: "会话已失效，请刷新页面后重试" });
      return;
    }
    deleting.value = true;
    try {
      const res = await $fetch("/api/admin/contents/batch-delete", {
        method: "POST",
        body: { ids: selectedIds.value, csrfToken: csrfToken.value },
      });
      toast.success({ message: res.message || "批量删除成功" });
      selectedIds.value = [];
      await fetchContents(pagination.value.page, false);
    } catch (error) {
      console.error("批量删除失败:", error);
      toast.error({ message: "批量删除失败" });
    } finally {
      deleting.value = false;
    }
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("zh-CN");
}

function getStatusBadge(status: number) {
  return status === 1 ? { label: "已发布", variant: "default" as const } : { label: "草稿", variant: "secondary" as const };
}

// 文章的分类关系：contentrelations 同时含分类与标签，这里只取分类用于「分类」列展示与预览链接。
function contentCategories(content: AdminContent) {
  return content.contentrelations?.filter(rel => rel.metas.type === "category") ?? [];
}

function editContent(cid: number) {
  router.push(`/admin/contents/edit?cid=${cid}`);
}

function previewContent(content: AdminContent) {
  // 草稿未发布到前台，直接预览会 404。
  if (content.status !== 1) {
    toast.warning({ message: "草稿文章暂不可在前台预览" });
    return;
  }
  // 只取分类 slug（过滤掉标签，避免拼出 /content/<标签slug>/<文章slug> 而 404）。
  const categorySlug = contentCategories(content)[0]?.metas.slug;
  if (!categorySlug) {
    toast.error({ message: "该文章未关联分类，无法生成预览链接" });
    return;
  }
  const contentSlug = content.slug || content.cid;
  window.open(`/content/${categorySlug}/${contentSlug}`, "_blank", "noopener");
}

function createContent() {
  router.push("/admin/contents/edit");
}

function goToPage(page: number) {
  if (page >= 1 && page <= pagination.value.totalPages) {
    fetchContents(page);
  }
}

onMounted(() => {
  // 获取 CSRF token
  (async () => {
    try {
      const csrfRes = await $fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" });
      if (csrfRes?.data?.token) csrfToken.value = csrfRes.data.token;
    } catch (error) {
      console.error("获取 CSRF token 失败:", error);
    }
  })();

  fetchCategories();
  fetchTags();

  const categoryId = route.query.category ? Number(route.query.category) : null;
  if (categoryId) {
    selectedCategory.value = categoryId;
  }

  const tagId = route.query.tag ? Number(route.query.tag) : null;
  if (tagId) {
    selectedTag.value = tagId;
  }

  // 从 URL 恢复状态筛选（status=0 是有效值「草稿」，需用存在性判断而非真值）
  if (route.query.status !== undefined) {
    const statusFromUrl = Number(route.query.status);
    if (!Number.isNaN(statusFromUrl) && [0, 1].includes(statusFromUrl)) {
      selectedStatus.value = statusFromUrl;
    }
  }

  // 从 URL 读取页码，默认第1页
  const pageFromUrl = Math.max(1, parseInt(route.query.page as string) || 1);
  fetchContents(pageFromUrl, false); // 不更新 URL，避免重复导航
});
</script>

<template>
  <AdminLayout>
    <!-- 页面标题 -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">文章管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理所有文章内容</p>
      </div>
      <div class="flex items-center gap-2">
        <Button v-if="selectedIds.length > 0" variant="destructive" :disabled="deleting" @click="batchDelete">
          <Icon name="lucide:trash-2" class="mr-2 size-4" />
          {{ deleting ? "删除中..." : `删除选中 (${selectedIds.length})` }}
        </Button>
        <Button @click="createContent">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          新建文章
        </Button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <Card class="mb-6">
      <CardContent class="pt-0">
        <div class="flex flex-wrap gap-4">
          <div class="flex items-center gap-2">
            <Label for="category-filter">分类:</Label>
            <ClientOnly>
              <Select id="category-filter" v-model="selectedCategory" @update:model-value="(v: AcceptableValue) => filterByCategory(v == null ? null : Number(v))">
                <SelectTrigger class="w-45">
                  <SelectValue placeholder="全部分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="null">全部分类</SelectItem>
                  <SelectItem v-for="category in categories" :key="category.mid ?? category.name" :value="category.mid">
                    {{ category.name }} ({{ category.contentCount }})
                  </SelectItem>
                </SelectContent>
              </Select>
              <template #fallback>
                <div class="w-45 h-9 bg-muted rounded-md animate-pulse" />
              </template>
            </ClientOnly>
          </div>
          <div class="flex items-center gap-2">
            <Label for="tag-filter">标签:</Label>
            <ClientOnly>
              <Select id="tag-filter" v-model="selectedTag" @update:model-value="(v: AcceptableValue) => filterByTag(v == null ? null : Number(v))">
                <SelectTrigger class="w-45">
                  <SelectValue placeholder="全部标签" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="null">全部标签</SelectItem>
                  <SelectItem v-for="tag in tags" :key="tag.mid ?? tag.name" :value="tag.mid"> {{ tag.name }} ({{ tag.contentCount }}) </SelectItem>
                </SelectContent>
              </Select>
              <template #fallback>
                <div class="w-45 h-9 bg-muted rounded-md animate-pulse" />
              </template>
            </ClientOnly>
          </div>
          <div class="flex items-center gap-2">
            <Label for="status-filter">状态:</Label>
            <ClientOnly>
              <Select id="status-filter" v-model="selectedStatus" @update:model-value="(v: AcceptableValue) => filterByStatus(v == null ? null : Number(v))">
                <SelectTrigger class="w-35">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in statusOptions" :key="option.value ?? option.label" :value="option.value">
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <template #fallback>
                <div class="w-35 h-9 bg-muted rounded-md animate-pulse" />
              </template>
            </ClientOnly>
          </div>
          <Button variant="outline" @click="clearFilters">
            <Icon name="lucide:x" class="mr-2 size-4" />
            清除筛选
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 文章列表 -->
    <Card>
      <!-- 加载状态 - 桌面端表格 -->
      <div v-if="loading" class="p-4 hidden min-[1175px]:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-12"/>
              <TableHead>标题</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>评论数</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="i in 5" :key="i">
              <TableCell>
                <div class="size-4 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-16 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-6 bg-muted rounded w-12 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-6 bg-muted rounded w-12 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-8 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-20 animate-pulse" />
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <div class="size-8 bg-muted rounded-lg animate-pulse" />
                  <div class="size-8 bg-muted rounded-lg animate-pulse" />
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 数据列表 - 桌面端表格 -->
      <Table v-else class="hidden min-[1175px]:table">
        <TableHeader>
          <TableRow>
            <TableHead class="w-12">
              <Checkbox :model-value="isAllSelected" :indeterminate="isIndeterminate" @update:model-value="toggleSelectAll" />
            </TableHead>
            <TableHead>标题</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>分类</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>评论数</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="content in contents" :key="content.cid" :class="{ 'bg-muted/50': selectedIds.includes(content.cid) }">
            <TableCell>
              <Checkbox :model-value="selectedIds.includes(content.cid)" @update:model-value="toggleSelect(content.cid)" />
            </TableCell>
            <TableCell class="font-medium">{{ content.title }}</TableCell>
            <TableCell class="text-muted-foreground font-mono text-sm">{{ content.slug || "-" }}</TableCell>
            <TableCell>
              <div v-if="contentCategories(content).length > 0" class="flex flex-wrap gap-1">
                <Badge v-for="rel in contentCategories(content)" :key="rel.metas.mid" variant="outline" class="text-xs">
                  {{ rel.metas.name }}
                </Badge>
              </div>
              <span v-else class="text-muted-foreground text-sm">-</span>
            </TableCell>
            <TableCell>
              <Badge :variant="getStatusBadge(content.status).variant">
                {{ getStatusBadge(content.status).label }}
              </Badge>
            </TableCell>
            <TableCell>{{ content.comment_num || 0 }}</TableCell>
            <TableCell>{{ formatDate(content.create_time) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8" title="预览" @click="previewContent(content)">
                  <Icon name="lucide:eye" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8" title="编辑" @click="editContent(content.cid)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" title="删除" @click="deleteContent(content.cid)">
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 加载状态 - 移动端卡片 -->
      <div v-if="loading" class="min-[1175px]:hidden space-y-4">
        <div v-for="i in 5" :key="i" class="border rounded-lg p-4 space-y-3">
          <div class="space-y-2">
            <div class="h-5 bg-muted rounded w-3/4 animate-pulse" />
            <div class="h-4 bg-muted rounded w-1/2 animate-pulse" />
          </div>
          <div class="flex gap-2">
            <div class="h-6 bg-muted rounded w-12 animate-pulse" />
            <div class="h-4 bg-muted rounded w-8 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 数据列表 - 移动端卡片 -->
      <div v-else class="min-[1175px]:hidden space-y-4">
        <div v-for="content in contents" :key="content.cid" class="border rounded-lg p-4 space-y-3">
          <div>
            <h3 class="font-medium text-base">{{ content.title }}</h3>
            <p class="text-sm text-muted-foreground font-mono mt-1">{{ content.slug || "-" }}</p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <div v-if="contentCategories(content).length > 0" class="flex flex-wrap gap-1">
              <Badge v-for="rel in contentCategories(content)" :key="rel.metas.mid" variant="outline" class="text-xs">
                {{ rel.metas.name }}
              </Badge>
            </div>
            <Badge :variant="getStatusBadge(content.status).variant">
              {{ getStatusBadge(content.status).label }}
            </Badge>
            <span class="text-sm text-muted-foreground">
              <Icon name="lucide:message-square" class="size-3 inline mr-1" />
              {{ content.comment_num || 0 }}
            </span>
          </div>

          <div class="flex items-center justify-between pt-2 border-t">
            <span class="text-xs text-muted-foreground">{{ formatDate(content.create_time) }}</span>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon" class="size-8" title="预览" @click="previewContent(content)">
                <Icon name="lucide:eye" class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" class="size-8" title="编辑" @click="editContent(content.cid)">
                <Icon name="lucide:pencil" class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" title="删除" @click="deleteContent(content.cid)">
                <Icon name="lucide:trash-2" class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && contents.length === 0" class="text-center py-12">
        <Icon name="lucide:file-text" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无文章</p>
        <Button variant="outline" class="mt-4" @click="createContent">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一篇文章
        </Button>
      </div>

      <!-- 分页 - 桌面端 -->
      <div v-if="!loading && pagination.totalPages > 1" class="hidden min-[1175px]:flex items-center justify-between pt-4 pb-2 border-t">
        <p class="text-sm text-muted-foreground">共 {{ pagination.total }} 篇文章，第 {{ pagination.page }} / {{ pagination.totalPages }} 页</p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">
            <Icon name="lucide:chevron-left" class="size-4" />
            上一页
          </Button>
          <div class="flex items-center gap-1">
            <Button
              v-for="(page, pageIndex) in pageRange"
              :key="typeof page === 'number' ? `page-${page}` : `gap-${pageIndex}`"
              :variant="page === pagination.page ? 'default' : 'outline'"
              size="sm"
              :disabled="page === '...'"
              :class="{ 'pointer-events-none': page === '...' }"
              @click="typeof page === 'number' && goToPage(page)">
              {{ page }}
            </Button>
          </div>
          <Button variant="outline" size="sm" :disabled="pagination.page >= pagination.totalPages" @click="goToPage(pagination.page + 1)">
            下一页
            <Icon name="lucide:chevron-right" class="size-4" />
          </Button>
        </div>
      </div>

      <!-- 分页 - 移动端 -->
      <div
        v-if="!loading && pagination.totalPages > 1"
        class="min-[1175px]:hidden flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 pb-2 border-t">
        <p class="text-sm text-muted-foreground text-center sm:text-left">
          第 {{ pagination.page }} / {{ pagination.totalPages }} 页，共 {{ pagination.total }} 篇
        </p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">
            <Icon name="lucide:chevron-left" class="size-4" />
          </Button>
          <span class="text-sm">{{ pagination.page }}</span>
          <Button variant="outline" size="sm" :disabled="pagination.page >= pagination.totalPages" @click="goToPage(pagination.page + 1)">
            <Icon name="lucide:chevron-right" class="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  </AdminLayout>
</template>
