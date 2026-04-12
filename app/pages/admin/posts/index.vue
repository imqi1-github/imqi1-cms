<script setup lang="ts">
const router = useRouter();
const route = useRoute();
const toast = useToast();
const loading = ref(true);
const posts = ref<any[]>([]);
const categories = ref<any[]>([]);
const tags = ref<any[]>([]);
const selectedCategory = ref<number | null>(null);
const selectedTag = ref<number | null>(null);
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
  return posts.value.length > 0 && selectedIds.value.length === posts.value.length;
});

const isIndeterminate = computed(() => {
  return selectedIds.value.length > 0 && selectedIds.value.length < posts.value.length;
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
    selectedIds.value = posts.value.map(p => p.cid);
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
    categories.value = (await $fetch("/api/admin/categories")) as any[];
  } catch (error) {
    console.error("获取分类失败:", error);
    categories.value = [];
  }
}

async function fetchTags() {
  try {
    tags.value = (await $fetch("/api/admin/tags")) as any[];
  } catch (error) {
    console.error("获取标签失败:", error);
    tags.value = [];
  }
}

async function fetchPosts(page: number = 1) {
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

    const res = (await $fetch(`/api/admin/posts?${params.toString()}`)) as any;
    posts.value = res.data || [];
    pagination.value = res.pagination || pagination.value;
  } catch (error) {
    console.error("获取文章失败:", error);
    posts.value = [];
  } finally {
    loading.value = false;
  }
}

function filterByCategory(categoryId: number | null) {
  selectedCategory.value = categoryId;
  fetchPosts(1);
}

function filterByTag(tagId: number | null) {
  selectedTag.value = tagId;
  fetchPosts(1);
}

function filterByStatus(status: number | null) {
  selectedStatus.value = status;
  fetchPosts(1);
}

function clearFilters() {
  selectedCategory.value = null;
  selectedTag.value = null;
  selectedStatus.value = null;
  fetchPosts(1);
}

async function deletePost(cid: number) {
  const confirmed = confirm("确定要删除这篇文章吗？");
  if (confirmed) {
    try {
      await $fetch(`/api/admin/posts/${cid}`, { method: "DELETE" });
      await fetchPosts(pagination.value.page);
      toast.success({ message: "文章已删除" });
    } catch (error) {
      console.error("删除失败:", error);
      toast.error({ message: "删除失败" });
    }
  }
}

async function batchDelete() {
  if (selectedIds.value.length === 0) {
    toast.error({ message: "请选择要删除的文章" });
    return;
  }

  const confirmed = confirm(`确定要删除选中的 ${selectedIds.value.length} 篇文章吗？`);
  if (confirmed) {
    deleting.value = true;
    try {
      const res = await $fetch("/api/admin/posts/batch-delete", {
        method: "POST",
        body: { ids: selectedIds.value },
      });
      toast.success({ message: (res as any).message || "批量删除成功" });
      selectedIds.value = [];
      await fetchPosts(pagination.value.page);
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

function editPost(cid: number) {
  router.push(`/admin/posts/edit?cid=${cid}`);
}

function createPost() {
  router.push("/admin/posts/edit");
}

function goToPage(page: number) {
  if (page >= 1 && page <= pagination.value.totalPages) {
    fetchPosts(page);
  }
}

onMounted(() => {
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

  fetchPosts();
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
        <Button @click="createPost">
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
            <Select id="category-filter" v-model="selectedCategory" @update:model-value="filterByCategory">
              <SelectTrigger class="w-[180px]">
                <SelectValue placeholder="全部分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">全部分类</SelectItem>
                <SelectItem v-for="category in categories" :key="category.mid" :value="category.mid">
                  {{ category.name }} ({{ category.postCount }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex items-center gap-2">
            <Label for="tag-filter">标签:</Label>
            <Select id="tag-filter" v-model="selectedTag" @update:model-value="filterByTag">
              <SelectTrigger class="w-[180px]">
                <SelectValue placeholder="全部标签" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">全部标签</SelectItem>
                <SelectItem v-for="tag in tags" :key="tag.mid" :value="tag.mid"> {{ tag.name }} ({{ tag.postCount }}) </SelectItem>
              </SelectContent>
            </Select>
          </div>
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
      <div v-if="loading" class="p-4 hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-12"></TableHead>
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
      <Table v-else class="hidden lg:table">
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
          <TableRow v-for="post in posts" :key="post.cid" :class="{ 'bg-muted/50': selectedIds.includes(post.cid) }">
            <TableCell>
              <Checkbox :model-value="selectedIds.includes(post.cid)" @update:model-value="toggleSelect(post.cid)" />
            </TableCell>
            <TableCell class="font-medium">{{ post.title }}</TableCell>
            <TableCell class="text-muted-foreground font-mono text-sm">{{ post.slug || "-" }}</TableCell>
            <TableCell>
              <div v-if="post.postrelation && post.postrelation.length > 0" class="flex flex-wrap gap-1">
                <Badge v-for="rel in post.postrelation" :key="rel.metas.mid" variant="outline" class="text-xs">
                  {{ rel.metas.name }}
                </Badge>
              </div>
              <span v-else class="text-muted-foreground text-sm">-</span>
            </TableCell>
            <TableCell>
              <Badge :variant="getStatusBadge(post.status).variant">
                {{ getStatusBadge(post.status).label }}
              </Badge>
            </TableCell>
            <TableCell>{{ post.comment_num || 0 }}</TableCell>
            <TableCell>{{ formatDate(post.create_time) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8" @click="editPost(post.cid)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deletePost(post.cid)">
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 加载状态 - 移动端卡片 -->
      <div v-if="loading" class="p-4 lg:hidden space-y-4">
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
      <div v-else class="p-4 lg:hidden space-y-4">
        <div v-for="post in posts" :key="post.cid" class="border rounded-lg p-4 space-y-3">
          <div>
            <h3 class="font-medium text-base">{{ post.title }}</h3>
            <p class="text-sm text-muted-foreground font-mono mt-1">{{ post.slug || "-" }}</p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <div v-if="post.postrelation && post.postrelation.length > 0" class="flex flex-wrap gap-1">
              <Badge v-for="rel in post.postrelation" :key="rel.metas.mid" variant="outline" class="text-xs">
                {{ rel.metas.name }}
              </Badge>
            </div>
            <Badge :variant="getStatusBadge(post.status).variant">
              {{ getStatusBadge(post.status).label }}
            </Badge>
            <span class="text-sm text-muted-foreground">
              <Icon name="lucide:message-square" class="size-3 inline mr-1" />
              {{ post.comment_num || 0 }}
            </span>
          </div>

          <div class="flex items-center justify-between pt-2 border-t">
            <span class="text-xs text-muted-foreground">{{ formatDate(post.create_time) }}</span>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon" class="size-8" @click="editPost(post.cid)">
                <Icon name="lucide:pencil" class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deletePost(post.cid)">
                <Icon name="lucide:trash-2" class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && posts.length === 0" class="text-center py-12">
        <Icon name="lucide:file-text" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无文章</p>
        <Button variant="outline" class="mt-4" @click="createPost">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一篇文章
        </Button>
      </div>

      <!-- 分页 - 桌面端 -->
      <div v-if="!loading && pagination.totalPages > 1" class="hidden lg:flex items-center justify-between pt-4 pb-2 border-t">
        <p class="text-sm text-muted-foreground">共 {{ pagination.total }} 篇文章，第 {{ pagination.page }} / {{ pagination.totalPages }} 页</p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">
            <Icon name="lucide:chevron-left" class="size-4" />
            上一页
          </Button>
          <div class="flex items-center gap-1">
            <Button
              v-for="page in pageRange"
              :key="page"
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
        class="lg:hidden flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 pb-2 border-t">
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
