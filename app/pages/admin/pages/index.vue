<script setup lang="ts">
const router = useRouter();
const toast = useToast();
const loading = ref(true);
const pages = ref<any[]>([]);
const selectedStatus = ref<number | null>(null);
const selectedIds = ref<number[]>([]);
const deleting = ref(false);
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
  return pages.value.length > 0 && selectedIds.value.length === pages.value.length;
});

const isIndeterminate = computed(() => {
  return selectedIds.value.length > 0 && selectedIds.value.length < pages.value.length;
});

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = [];
  } else {
    selectedIds.value = pages.value.map(p => p.cid);
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

async function fetchPages(page: number = 1) {
  loading.value = true;
  selectedIds.value = [];
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: "10",
    });

    if (selectedStatus.value !== null) {
      params.append("status", selectedStatus.value.toString());
    }

    const res = (await $fetch(`/api/admin/pages?${params.toString()}`)) as any;
    pages.value = res.data || [];
    pagination.value = res.pagination || pagination.value;
  } catch (error) {
    console.error("获取页面失败:", error);
    pages.value = [];
  } finally {
    loading.value = false;
  }
}

function filterByStatus(status: number | null) {
  selectedStatus.value = status;
  fetchPages(1);
}

async function deletePage(cid: number) {
  const confirmed = confirm("确定要删除这个页面吗？");
  if (confirmed) {
    try {
      await $fetch(`/api/admin/posts/${cid}`, { method: "DELETE" });
      await fetchPages(pagination.value.page);
      toast.success({ message: "页面已删除" });
    } catch (error) {
      console.error("删除失败:", error);
      toast.error({ message: "删除失败" });
    }
  }
}

async function batchDelete() {
  if (selectedIds.value.length === 0) {
    toast.error({ message: "请选择要删除的页面" });
    return;
  }

  const confirmed = confirm(`确定要删除选中的 ${selectedIds.value.length} 个页面吗？`);
  if (confirmed) {
    deleting.value = true;
    try {
      const res = await $fetch("/api/admin/posts/batch-delete", {
        method: "POST",
        body: { ids: selectedIds.value },
      });
      toast.success({ message: (res as any).message || "批量删除成功" });
      selectedIds.value = [];
      await fetchPages(pagination.value.page);
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

function editPage(cid: number) {
  router.push(`/admin/pages/edit?cid=${cid}`);
}

function createPage() {
  router.push("/admin/pages/edit");
}

function goToPage(page: number) {
  if (page >= 1 && page <= pagination.value.totalPages) {
    fetchPages(page);
  }
}

function previewPage(cid: number, slug: string | null) {
  if (slug) {
    window.open(`/page/${slug}`, "_blank");
  } else {
    window.open(`/page/${cid}`, "_blank");
  }
}

onMounted(() => {
  fetchPages();
});
</script>

<template>
  <AdminLayout>
    <!-- 页面标题 -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">页面管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理独立页面（如关于、留言等）</p>
      </div>
      <div class="flex items-center gap-2">
        <Button v-if="selectedIds.length > 0" variant="destructive" :disabled="deleting" @click="batchDelete">
          <Icon name="lucide:trash-2" class="mr-2 size-4" />
          {{ deleting ? "删除中..." : `删除选中 (${selectedIds.length})` }}
        </Button>
        <Button @click="createPage">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          新建页面
        </Button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <Card class="mb-6">
      <CardContent class="pt-0">
        <div class="flex flex-wrap gap-4">
          <div class="flex items-center gap-2">
            <Label for="status-filter">状态:</Label>
            <Select id="status-filter" v-model="selectedStatus" @update:model-value="filterByStatus">
              <SelectTrigger class="w-[140px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in statusOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 页面列表 -->
    <Card>
      <!-- 加载状态 -->
      <div v-if="loading" class="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-12"></TableHead>
              <TableHead>标题</TableHead>
              <TableHead>Slug</TableHead>
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

      <!-- 数据列表 -->
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead class="w-12">
              <Checkbox :model-value="isAllSelected" :indeterminate="isIndeterminate" @update:model-value="toggleSelectAll" />
            </TableHead>
            <TableHead>标题</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>评论数</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="page in pages" :key="page.cid" :class="{ 'bg-muted/50': selectedIds.includes(page.cid) }">
            <TableCell>
              <Checkbox :model-value="selectedIds.includes(page.cid)" @update:model-value="toggleSelect(page.cid)" />
            </TableCell>
            <TableCell class="font-medium">{{ page.title }}</TableCell>
            <TableCell class="text-muted-foreground font-mono text-sm">{{ page.slug || "-" }}</TableCell>
            <TableCell>
              <Badge :variant="getStatusBadge(page.status).variant">
                {{ getStatusBadge(page.status).label }}
              </Badge>
            </TableCell>
            <TableCell>{{ page.comment_num || 0 }}</TableCell>
            <TableCell>{{ formatDate(page.create_time) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8" @click="previewPage(page.cid, page.slug)">
                  <Icon name="lucide:eye" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8" @click="editPage(page.cid)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deletePage(page.cid)">
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 空状态 -->
      <div v-if="!loading && pages.length === 0" class="text-center py-12">
        <Icon name="lucide:file-text" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无页面</p>
        <Button variant="outline" class="mt-4" @click="createPage">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一个页面
        </Button>
      </div>

      <!-- 分页 -->
      <div v-if="!loading && pagination.totalPages > 1" class="flex items-center justify-between pt-4 pb-2 border-t">
        <p class="text-sm text-muted-foreground">共 {{ pagination.total }} 个页面，第 {{ pagination.page }} / {{ pagination.totalPages }} 页</p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">
            <Icon name="lucide:chevron-left" class="size-4" />
            上一页
          </Button>
          <div class="flex items-center gap-1">
            <Button
              v-for="page in Math.min(pagination.totalPages, 5)"
              :key="page"
              variant="outline"
              size="sm"
              :class="{ 'bg-primary text-primary-foreground': page === pagination.page }"
              @click="goToPage(page)">
              {{ page }}
            </Button>
            <span v-if="pagination.totalPages > 5" class="px-2 text-muted-foreground">...</span>
          </div>
          <Button variant="outline" size="sm" :disabled="pagination.page >= pagination.totalPages" @click="goToPage(pagination.page + 1)">
            下一页
            <Icon name="lucide:chevron-right" class="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  </AdminLayout>
</template>
