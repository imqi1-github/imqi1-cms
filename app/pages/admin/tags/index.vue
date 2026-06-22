<script setup lang="ts">
const router = useRouter();
const toast = useToast();

const loading = ref(true);
const tags = ref<any[]>([]);
const showAddModal = ref(false);
const showEditModal = ref(false);
const newTag = ref({ name: "", slug: "", desc: "" });
const editingTag = ref<any>(null);

async function fetchTags() {
  loading.value = true;
  try {
    tags.value = (await ($fetch as any)("/api/admin/tags")) as any[];
  } catch (error) {
    console.error("获取标签失败:", error);
    tags.value = [];
  } finally {
    loading.value = false;
  }
}

async function addTag() {
  try {
    await $fetch("/api/admin/tags", {
      method: "POST",
      body: newTag.value,
    });
    newTag.value = { name: "", slug: "", desc: "" };
    showAddModal.value = false;
    toast.success({ message: "标签创建成功" });
    await fetchTags();
  } catch (error: any) {
    toast.error({
      message: "添加失败",
      description: error?.data?.message || "请稍后重试",
    });
  }
}

function openEditModal(tag: any) {
  editingTag.value = { ...tag };
  showEditModal.value = true;
}

// 关闭添加弹窗
function closeAddModal() {
  showAddModal.value = false;
  nextTick(() => {
    newTag.value = { name: "", slug: "", desc: "" };
  });
}

// 关闭编辑弹窗
function closeEditModal() {
  showEditModal.value = false;
  nextTick(() => {
    editingTag.value = null;
  });
}

// 处理 Dialog open 状态变化
function handleAddModalOpenChange(open: boolean) {
  showAddModal.value = open;
  if (!open) {
    nextTick(() => {
      newTag.value = { name: "", slug: "", desc: "" };
    });
  }
}

function handleEditModalOpenChange(open: boolean) {
  showEditModal.value = open;
  if (!open) {
    nextTick(() => {
      editingTag.value = null;
    });
  }
}

async function updateTag() {
  if (!editingTag.value) return;

  try {
    await $fetch(`/api/admin/tags/${editingTag.value.mid}`, {
      method: "PUT",
      body: {
        name: editingTag.value.name,
        slug: editingTag.value.slug,
        desc: editingTag.value.desc,
      },
    });
    showEditModal.value = false;
    toast.success({ message: "标签更新成功" });
    await fetchTags();
    // 延迟清空编辑数据，避免 Dialog 关闭动画过程中出现渲染错误
    nextTick(() => {
      editingTag.value = null;
    });
  } catch (error: any) {
    toast.error({
      message: "更新失败",
      description: error?.data?.message || "请稍后重试",
    });
  }
}

async function deleteTag(mid: number) {
  const confirmed = confirm("确定要删除这个标签吗？删除后文章将不再关联此标签。");
  if (confirmed) {
    try {
      await $fetch(`/api/admin/tags/${mid}`, { method: "DELETE" });
      toast.success({ message: "标签删除成功" });
      await fetchTags();
    } catch (error: any) {
      toast.error({
        message: "删除失败",
        description: error?.data?.message || "请稍后重试",
      });
    }
  }
}

function viewTagPosts(tag: any) {
  router.push(`/admin/posts?tag=${tag.mid}`);
}

onMounted(() => {
  fetchTags();
});
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">标签管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理文章标签</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建标签
      </Button>
    </div>

    <Card>
      <!-- 加载状态 - 桌面端表格 -->
      <div v-if="loading" class="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>文章数</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="i in 5" :key="i">
              <TableCell>
                <div class="h-4 bg-muted rounded w-24 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-20 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-48 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-8 animate-pulse" />
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <div class="size-8 bg-muted rounded-lg animate-pulse" />
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
            <TableHead>名称</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>描述</TableHead>
            <TableHead>文章数</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="tag in tags" :key="tag.mid">
            <TableCell class="font-medium">{{ tag.name }}</TableCell>
            <TableCell class="text-muted-foreground font-mono">{{ tag.slug || "-" }}</TableCell>
            <TableCell class="text-muted-foreground">{{ tag.desc || "-" }}</TableCell>
            <TableCell>
              <button
                class="flex items-center gap-1 text-sm hover:text-primary transition-colors"
                :class="{ 'text-muted-foreground': tag.postCount === 0 }"
                :disabled="tag.postCount === 0"
                @click="viewTagPosts(tag)">
                <Icon name="lucide:file-text" class="size-4" />
                <span>{{ tag.postCount }}</span>
              </button>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8" title="查看文章" :disabled="tag.postCount === 0" @click="viewTagPosts(tag)">
                  <Icon name="lucide:list" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8" title="编辑" @click="openEditModal(tag)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" title="删除" @click="deleteTag(tag.mid)">
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
            <div class="h-5 bg-muted rounded w-20 animate-pulse" />
            <div class="h-4 bg-muted rounded w-16 animate-pulse" />
          </div>
          <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
          <div class="flex gap-2">
            <div class="h-6 bg-muted rounded w-12 animate-pulse" />
            <div class="h-4 bg-muted rounded w-8 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 数据列表 - 移动端卡片 -->
      <div v-else class="p-4 lg:hidden space-y-4">
        <div v-for="tag in tags" :key="tag.mid" class="border rounded-lg p-4 space-y-3">
          <div>
            <h3 class="font-medium text-base">{{ tag.name }}</h3>
            <p class="text-xs text-muted-foreground font-mono mt-1">{{ tag.slug || "-" }}</p>
          </div>
          <p class="text-sm text-muted-foreground">{{ tag.desc || "暂无描述" }}</p>

          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1 text-sm hover:text-primary transition-colors"
              :class="{ 'text-muted-foreground': tag.postCount === 0 }"
              :disabled="tag.postCount === 0"
              @click="viewTagPosts(tag)">
              <Icon name="lucide:file-text" class="size-3" />
              <span>{{ tag.postCount }} 篇</span>
            </button>
          </div>

          <div class="flex items-center justify-end pt-2 border-t gap-1">
            <Button variant="ghost" size="icon" class="size-8" title="查看文章" :disabled="tag.postCount === 0" @click="viewTagPosts(tag)">
              <Icon name="lucide:list" class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" class="size-8" title="编辑" @click="openEditModal(tag)">
              <Icon name="lucide:pencil" class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" title="删除" @click="deleteTag(tag.mid)">
              <Icon name="lucide:trash-2" class="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && tags.length === 0" class="text-center py-12">
        <Icon name="lucide:tag" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无标签</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一个标签
        </Button>
      </div>
    </Card>

    <!-- 添加标签弹窗 -->
    <Dialog :open="showAddModal" @update:open="handleAddModalOpenChange">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建标签</DialogTitle>
          <DialogDescription>创建一个新的文章标签</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addTag">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="name">名称</Label>
              <Input id="name" v-model="newTag.name" placeholder="标签名称" required />
            </div>
            <div class="space-y-2">
              <Label for="slug">Slug</Label>
              <Input id="slug" v-model="newTag.slug" placeholder="标签 URL 标识" />
            </div>
            <div class="space-y-2">
              <Label for="desc">描述</Label>
              <Textarea id="desc" v-model="newTag.desc" placeholder="标签描述" rows="3" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="closeAddModal"> 取消 </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- 编辑标签弹窗 -->
    <Dialog :open="showEditModal" @update:open="handleEditModalOpenChange">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑标签</DialogTitle>
          <DialogDescription>修改标签信息</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="updateTag">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="edit-name">名称</Label>
              <Input id="edit-name" v-model="editingTag.name" placeholder="标签名称" required />
            </div>
            <div class="space-y-2">
              <Label for="edit-slug">Slug</Label>
              <Input id="edit-slug" v-model="editingTag.slug" placeholder="标签 URL 标识" />
            </div>
            <div class="space-y-2">
              <Label for="edit-desc">描述</Label>
              <Textarea id="edit-desc" v-model="editingTag.desc" placeholder="标签描述" rows="3" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="closeEditModal"> 取消 </Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
