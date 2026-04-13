<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const toast = useToast();
const loading = ref(true);
const comments = ref<any[]>([]);
const selectedIds = ref<number[]>([]);
const deleting = ref(false);
const filterCid = ref<number | null>(null); // 筛选的文章ID
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
});

// 编辑对话框状态
const editDialogOpen = ref(false);
const editingComment = ref<any>(null);
const editForm = ref({
  name: "",
  mail: "",
  content: "",
  status: 0,
});

// 状态选项
const statusOptions = [
  { value: 0, label: "待审核", variant: "secondary" as const },
  { value: 1, label: "已通过", variant: "default" as const },
  { value: 2, label: "垃圾评论", variant: "destructive" as const },
];

const isAllSelected = computed(() => {
  return comments.value.length > 0 && selectedIds.value.length === comments.value.length;
});

const isIndeterminate = computed(() => {
  return selectedIds.value.length > 0 && selectedIds.value.length < comments.value.length;
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
    selectedIds.value = comments.value.map(c => c.coid);
  }
}

function toggleSelect(coid: number) {
  const index = selectedIds.value.indexOf(coid);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(coid);
  }
}

async function fetchComments(page: number = 1, updateUrl: boolean = true) {
  loading.value = true;
  selectedIds.value = [];
  try {
    // 构建查询参数
    let url = `/api/admin/comments?page=${page}&pageSize=20`;
    if (filterCid.value) {
      url += `&cid=${filterCid.value}`;
    }
    const res = (await $fetch(url)) as any;
    comments.value = res.data || [];
    pagination.value = res.pagination || pagination.value;

    // 更新 URL（如果需要）
    if (updateUrl) {
      const query: any = {};
      if (page > 1) query.page = page.toString();
      if (filterCid.value) query.cid = filterCid.value.toString();
      await router.push({ query });
    }
  } catch (error) {
    console.error("获取评论失败:", error);
    comments.value = [];
  } finally {
    loading.value = false;
  }
}

// 按文章筛选评论
function filterByPost(cid: number) {
  filterCid.value = cid;
  fetchComments(1);
}

// 清除筛选
function clearFilter() {
  filterCid.value = null;
  fetchComments(1);
}

// 打开编辑对话框
function openEditDialog(comment: any) {
  editingComment.value = comment;
  editForm.value = {
    name: comment.name || "",
    mail: comment.mail || "",
    content: comment.content || "",
    status: comment.status ?? 0,
  };
  editDialogOpen.value = true;
}

// 保存编辑
async function saveEdit() {
  if (!editingComment.value) return;

  try {
    const res = (await $fetch(`/api/admin/comments/${editingComment.value.coid}`, {
      method: "PATCH",
      body: editForm.value,
    })) as any;

    toast.success({
      message: "评论更新成功",
    });
    editDialogOpen.value = false;
    await fetchComments(pagination.value.page, false);
  } catch (error) {
    toast.error({
      message: "更新失败",
    });
  }
}

// 快捷设置状态
async function setStatus(coid: number, status: number) {
  try {
    await $fetch(`/api/admin/comments/${coid}`, {
      method: "PATCH",
      body: { status },
    });
    await fetchComments(pagination.value.page, false);
    toast.success({
      message: "状态已更新",
    });
  } catch (error) {
    toast.error({
      message: "操作失败",
    });
  }
}

async function deleteComment(coid: number) {
  const confirmed = confirm("确定要删除这条评论吗？");
  if (confirmed) {
    try {
      await $fetch(`/api/admin/comments/${coid}`, { method: "DELETE" });
      await fetchComments(pagination.value.page, false);
      toast.success({
        message: "评论已删除",
      });
    } catch (error) {
      toast.error({
        message: "删除失败",
      });
    }
  }
}

async function batchDelete() {
  if (selectedIds.value.length === 0) {
    toast.error({ message: "请选择要删除的评论" });
    return;
  }

  const confirmed = confirm(`确定要删除选中的 ${selectedIds.value.length} 条评论吗？`);
  if (confirmed) {
    deleting.value = true;
    try {
      const res = await $fetch("/api/admin/comments/batch-delete", {
        method: "POST",
        body: { ids: selectedIds.value },
      });
      toast.success({ message: (res as any).message || "批量删除成功" });
      selectedIds.value = [];
      await fetchComments(pagination.value.page, false);
    } catch (error) {
      console.error("批量删除失败:", error);
      toast.error({ message: "批量删除失败" });
    } finally {
      deleting.value = false;
    }
  }
}

function goToPage(page: number) {
  if (page >= 1 && page <= pagination.value.totalPages) {
    fetchComments(page);
  }
}

function getPostTitle(comment: any) {
  return comment.post?.title || "未知";
}

function formatDate(date: string) {
  return new Date(date).toLocaleString("zh-CN");
}

function getStatusInfo(status: number) {
  return statusOptions.find(s => s.value === status) || statusOptions[0];
}

onMounted(() => {
  // 从 URL 读取页码和筛选参数，默认第1页
  const pageFromUrl = parseInt(route.query.page as string) || 1;
  const cidFromUrl = route.query.cid ? parseInt(route.query.cid as string) : null;
  if (cidFromUrl) {
    filterCid.value = cidFromUrl;
  }
  fetchComments(pageFromUrl, false); // 不更新 URL，避免重复导航
});
</script>

<template>
  <AdminLayout>
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div>
        <h2 class="text-2xl font-bold">评论管理</h2>
        <p class="text-sm text-muted-foreground mt-1">
          {{ filterCid ? `筛选文章: ${comments[0]?.post?.title || ''}` : '审核和管理用户评论' }}
        </p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <Button v-if="filterCid" variant="outline" @click="clearFilter" class="flex-1 sm:flex-none">
          <Icon name="lucide:x" class="mr-2 size-4" />
          显示所有评论
        </Button>
        <Button v-if="selectedIds.length > 0" variant="destructive" :disabled="deleting" @click="batchDelete" class="flex-1 sm:flex-none">
          <Icon name="lucide:trash-2" class="mr-2 size-4" />
          {{ deleting ? "删除中..." : `删除选中 (${selectedIds.length})` }}
        </Button>
      </div>
    </div>

    <Card class="overflow-hidden">
      <!-- 超大屏表格视图 (≥1536px / 2xl) -->
      <div class="hidden 2xl:block">
        <!-- 加载状态 -->
        <div v-if="loading" class="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-12"></TableHead>
                <TableHead>评论者</TableHead>
                <TableHead>内容</TableHead>
                <TableHead>文章</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead class="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="i in 5" :key="i">
                <TableCell>
                  <div class="size-4 bg-muted rounded animate-pulse" />
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-3">
                    <div class="size-8 bg-muted rounded-full animate-pulse" />
                    <div class="space-y-1">
                      <div class="h-4 bg-muted rounded w-20 animate-pulse" />
                      <div class="h-3 bg-muted rounded w-32 animate-pulse" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="h-4 bg-muted rounded w-full max-w-md animate-pulse" />
                </TableCell>
                <TableCell>
                  <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                </TableCell>
                <TableCell>
                  <div class="h-6 bg-muted rounded w-16 animate-pulse" />
                </TableCell>
                <TableCell>
                  <div class="h-4 bg-muted rounded w-32 animate-pulse" />
                </TableCell>
                <TableCell class="text-right">
                  <div class="size-8 bg-muted rounded-lg animate-pulse ms-auto" />
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
              <TableHead>评论者</TableHead>
              <TableHead>内容</TableHead>
              <TableHead>文章</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>时间</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="comment in comments" :key="comment.coid" :class="{ 'bg-muted/50': selectedIds.includes(comment.coid) }">
              <TableCell>
                <Checkbox :model-value="selectedIds.includes(comment.coid)" @update:model-value="toggleSelect(comment.coid)" />
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-3">
                  <Avatar class="size-8">
                    <AvatarImage
                      v-if="comment.avatarUrl"
                      :src="comment.avatarUrl"
                      :alt="comment.name"
                    />
                    <AvatarFallback>{{ comment.name?.charAt(0) || "?" }}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p class="font-medium">{{ comment.name }}</p>
                    <p class="text-sm text-muted-foreground">{{ comment.mail || "-" }}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <p class="max-w-md line-clamp-2">{{ comment.content }}</p>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-auto p-1 justify-start text-left font-normal hover:bg-muted"
                  @click="filterByPost(comment.cid)">
                  <Icon name="lucide:filter" class="size-3 mr-1 flex-shrink-0" />
                  <span class="text-sm truncate">{{ getPostTitle(comment) }}</span>
                </Button>
              </TableCell>
              <TableCell>
                <Badge :variant="getStatusInfo(comment.status).variant">
                  {{ getStatusInfo(comment.status).label }}
                </Badge>
              </TableCell>
              <TableCell>
                <span class="text-sm text-muted-foreground">{{ formatDate(comment.create_time) }}</span>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="icon" class="size-8">
                        <Icon name="lucide:more-horizontal" class="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="openEditDialog(comment)">
                        <Icon name="lucide:pencil" class="mr-2 size-4" />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>设置状态</DropdownMenuLabel>
                      <DropdownMenuItem v-for="option in statusOptions" :key="option.value" @click="setStatus(comment.coid, option.value)">
                        <Icon :name="comment.status === option.value ? 'lucide:check' : 'lucide:circle'" class="mr-2 size-4" />
                        {{ option.label }}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteComment(comment.coid)">
                        <Icon name="lucide:trash-2" class="mr-2 size-4" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- 空状态 -->
        <div v-if="!loading && comments.length === 0" class="text-center py-12">
          <Icon name="lucide:message-square" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground">暂无评论</p>
        </div>
      </div>

      <!-- 中屏到大屏卡片视图 (1024px - 1535px / lg - xl) -->
      <div class="hidden lg:block 2xl:hidden">
        <!-- 加载状态 -->
        <div v-if="loading" class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div v-for="i in 4" :key="i" class="border rounded-lg p-4 space-y-3">
            <div class="flex items-center gap-3">
              <div class="size-8 bg-muted rounded-full animate-pulse" />
              <div class="space-y-1 flex-1">
                <div class="h-4 bg-muted rounded w-20 animate-pulse" />
                <div class="h-3 bg-muted rounded w-32 animate-pulse" />
              </div>
              <div class="size-6 bg-muted rounded animate-pulse" />
            </div>
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-full animate-pulse" />
              <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
              <div class="h-3 bg-muted rounded w-1/2 animate-pulse" />
            </div>
          </div>
        </div>

        <!-- 数据列表 - 网格布局 -->
        <div v-else class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            v-for="comment in comments"
            :key="comment.coid"
            class="border rounded-lg p-4 space-y-3"
            :class="{ 'bg-muted/50': selectedIds.includes(comment.coid) }">
            <!-- 头部 -->
            <div class="flex items-start gap-3">
              <Checkbox
                :model-value="selectedIds.includes(comment.coid)"
                @update:model-value="toggleSelect(comment.coid)"
                class="mt-1" />
              <Avatar class="size-10">
                <AvatarImage
                  v-if="comment.avatarUrl"
                  :src="comment.avatarUrl"
                  :alt="comment.name" />
                <AvatarFallback>{{ comment.name?.charAt(0) || "?" }}</AvatarFallback>
              </Avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="font-medium truncate">{{ comment.name }}</p>
                  <Badge :variant="getStatusInfo(comment.status).variant" class="text-xs">
                    {{ getStatusInfo(comment.status).label }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground mt-0.5">{{ comment.mail || "-" }}</p>
              </div>
            </div>

            <!-- 评论内容 -->
            <div class="pl-9 space-y-2">
              <p class="text-sm line-clamp-3 whitespace-pre-wrap break-words">{{ comment.content }}</p>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-auto p-0.5 justify-start text-left font-normal hover:bg-muted"
                  @click="filterByPost(comment.cid)">
                  <Icon name="lucide:filter" class="size-3 mr-1 flex-shrink-0" />
                  <span class="truncate">{{ getPostTitle(comment) }}</span>
                </Button>
                <span class="flex items-center">
                  <Icon name="lucide:clock" class="size-3 mr-1 flex-shrink-0" />
                  {{ formatDate(comment.create_time) }}
                </span>
              </div>
            </div>

            <!-- 操作 -->
            <div class="flex items-center justify-end pl-9 pt-2 border-t">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-8">
                    <Icon name="lucide:more-horizontal" class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="openEditDialog(comment)">
                    <Icon name="lucide:pencil" class="mr-2 size-4" />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>设置状态</DropdownMenuLabel>
                  <DropdownMenuItem v-for="option in statusOptions" :key="option.value" @click="setStatus(comment.coid, option.value)">
                    <Icon :name="comment.status === option.value ? 'lucide:check' : 'lucide:circle'" class="mr-2 size-4" />
                    {{ option.label }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteComment(comment.coid)">
                    <Icon name="lucide:trash-2" class="mr-2 size-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="!loading && comments.length === 0" class="text-center py-12">
          <Icon name="lucide:message-square" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground">暂无评论</p>
        </div>
      </div>

      <!-- 小屏卡片视图 (<1024px) -->
      <div class="lg:hidden p-3 sm:p-4 space-y-3 sm:space-y-4">
        <!-- 移动端加载状态 -->
        <div v-if="loading" class="space-y-3 sm:space-y-4">
          <div v-for="i in 3" :key="i" class="border rounded-lg p-3 sm:p-4 space-y-3">
            <div class="flex items-center gap-3">
              <div class="size-8 sm:size-10 bg-muted rounded-full animate-pulse" />
              <div class="space-y-1 flex-1">
                <div class="h-4 bg-muted rounded w-20 animate-pulse" />
                <div class="h-3 bg-muted rounded w-32 animate-pulse" />
              </div>
              <div class="size-6 bg-muted rounded animate-pulse" />
            </div>
            <div class="space-y-2">
              <div class="h-4 bg-muted rounded w-full animate-pulse" />
              <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
              <div class="h-3 bg-muted rounded w-1/2 animate-pulse" />
            </div>
          </div>
        </div>

        <!-- 移动端数据列表 -->
        <div v-else-if="comments.length > 0" class="space-y-3 sm:space-y-4">
          <div
            v-for="comment in comments"
            :key="comment.coid"
            class="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3"
            :class="{ 'bg-muted/50': selectedIds.includes(comment.coid) }">
            <!-- 头部：选择框、头像、信息、状态 -->
            <div class="flex items-start gap-2 sm:gap-3">
              <Checkbox
                :model-value="selectedIds.includes(comment.coid)"
                @update:model-value="toggleSelect(comment.coid)"
                class="mt-1" />
              <Avatar class="size-8 sm:size-10">
                <AvatarImage
                  v-if="comment.avatarUrl"
                  :src="comment.avatarUrl"
                  :alt="comment.name" />
                <AvatarFallback class="text-xs sm:text-sm">{{ comment.name?.charAt(0) || "?" }}</AvatarFallback>
              </Avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <p class="font-medium text-sm sm:text-base truncate">{{ comment.name }}</p>
                  <Badge :variant="getStatusInfo(comment.status).variant" class="text-xs">
                    {{ getStatusInfo(comment.status).label }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground mt-0.5">{{ comment.mail || "-" }}</p>
              </div>
            </div>

            <!-- 评论内容 -->
            <div class="pl-7 sm:pl-9 space-y-2">
              <p class="text-sm line-clamp-4 whitespace-pre-wrap break-words">{{ comment.content }}</p>
              <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-auto p-0.5 justify-start text-left font-normal hover:bg-muted"
                  @click="filterByPost(comment.cid)">
                  <Icon name="lucide:filter" class="size-3 mr-1 flex-shrink-0" />
                  <span class="truncate">{{ getPostTitle(comment) }}</span>
                </Button>
                <span class="flex items-center">
                  <Icon name="lucide:clock" class="size-3 mr-1 flex-shrink-0" />
                  {{ formatDate(comment.create_time) }}
                </span>
              </div>
            </div>

            <!-- 底部操作 -->
            <div class="flex items-center justify-end pl-7 sm:pl-9 pt-2 border-t">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-8">
                    <Icon name="lucide:more-horizontal" class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="openEditDialog(comment)">
                    <Icon name="lucide:pencil" class="mr-2 size-4" />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>设置状态</DropdownMenuLabel>
                  <DropdownMenuItem v-for="option in statusOptions" :key="option.value" @click="setStatus(comment.coid, option.value)">
                    <Icon :name="comment.status === option.value ? 'lucide:check' : 'lucide:circle'" class="mr-2 size-4" />
                    {{ option.label }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteComment(comment.coid)">
                    <Icon name="lucide:trash-2" class="mr-2 size-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <!-- 移动端空状态 -->
        <div v-if="!loading && comments.length === 0" class="text-center py-12">
          <Icon name="lucide:message-square" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground">暂无评论</p>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="!loading && pagination.totalPages > 1" class="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 pt-3 sm:pt-4 pb-2 border-t px-3 sm:px-4">
        <p class="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
          共 {{ pagination.total }} 条评论，第 {{ pagination.page }} / {{ pagination.totalPages }} 页
        </p>
        <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center">
          <Button variant="outline" size="sm" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)" class="h-8 px-2">
            <Icon name="lucide:chevron-left" class="size-4" />
            <span class="hidden sm:inline ml-1">上一页</span>
          </Button>
          <div class="flex items-center gap-1">
            <Button
              v-for="page in pageRange"
              :key="page"
              :variant="page === pagination.page ? 'default' : 'outline'"
              size="sm"
              :disabled="page === '...'"
              :class="{ 'pointer-events-none': page === '...', 'h-8 w-8 p-0': true, 'text-xs': true }"
              @click="typeof page === 'number' && goToPage(page)">
              {{ page }}
            </Button>
          </div>
          <Button variant="outline" size="sm" :disabled="pagination.page >= pagination.totalPages" @click="goToPage(pagination.page + 1)" class="h-8 px-2">
            <span class="hidden sm:inline mr-1">下一页</span>
            <Icon name="lucide:chevron-right" class="size-4" />
          </Button>
        </div>
      </div>
    </Card>

    <!-- 编辑对话框 -->
    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>编辑评论</DialogTitle>
          <DialogDescription>修改评论内容和状态</DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <!-- 昵称 -->
          <div class="space-y-2">
            <Label for="edit-name">昵称</Label>
            <Input id="edit-name" v-model="editForm.name" placeholder="评论者昵称" />
          </div>

          <!-- 邮箱 -->
          <div class="space-y-2">
            <Label for="edit-mail">邮箱</Label>
            <Input id="edit-mail" v-model="editForm.mail" type="email" placeholder="邮箱地址" />
          </div>

          <!-- 状态 -->
          <div class="space-y-2">
            <Label for="edit-status">状态</Label>
            <Select v-model="editForm.status">
              <SelectTrigger id="edit-status">
                <SelectValue :placeholder="getStatusInfo(editForm.status).label" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in statusOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 评论内容 -->
          <div class="space-y-2">
            <Label for="edit-content">评论内容</Label>
            <Textarea id="edit-content" v-model="editForm.content" placeholder="评论内容" :rows="5" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editDialogOpen = false"> 取消 </Button>
          <Button @click="saveEdit">
            <Icon name="lucide:save" class="mr-2 size-4" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
