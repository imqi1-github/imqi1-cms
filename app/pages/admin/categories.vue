<script setup lang="ts">
import type {
  CategoryCreateResponse,
  CategoryDeleteResponse,
  CategoryItem,
  CategoryUpdateResponse,
  CsrfResponse,
} from "~/types/apis/admin/categories";
import type { ApiError } from "~/types/error";

const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();

const loading = ref(true);
const categories = ref<CategoryItem[]>([]);
const showAddModal = ref(false);
const showEditModal = ref(false);
const newCategory = ref({ name: "", slug: "", desc: "" });
const submitting = ref(false);
const editingCategory = ref<CategoryItem | null>(null);
const editCategoryForm = ref({ name: "", slug: "", desc: "" });
const csrfToken = ref("");

async function fetchCategories() {
  loading.value = true;
  try {
    // 获取 CSRF token
    const csrfRes = await $fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) {
      csrfToken.value = csrfRes.data.token;
    }

    categories.value = await $fetch<CategoryItem[]>("/api/admin/categories");
  } catch (error) {
    console.error("获取分类失败:", error);
    categories.value = [];
  } finally {
    loading.value = false;
  }
}

async function addCategory() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    await $fetch<CategoryCreateResponse>("/api/admin/categories/create", {
      method: "POST",
      body: {
        csrfToken: csrfToken.value,
        ...newCategory.value,
      },
    });

    closeAddModal();
    toast.success({ message: "分类创建成功" });
    await fetchCategories();
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    console.error("添加失败:", error);

    let errorMessage = "添加失败";
    if (error?.data?.message) {
      errorMessage = error.data.message;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    toast.error({
      message: errorMessage,
      description: "请稍后重试",
    });
  } finally {
    submitting.value = false;
  }
}

function openEditModal(category: CategoryItem) {
  editingCategory.value = category;
  editCategoryForm.value = {
    name: category.name || "",
    slug: category.slug || "",
    desc: category.desc || "",
  };
  showEditModal.value = true;
}

// 关闭添加弹窗（同时重置表单，避免再次打开残留陈旧草稿）
function closeAddModal() {
  showAddModal.value = false;
  newCategory.value = { name: "", slug: "", desc: "" };
}

// 关闭编辑弹窗
function closeEditModal() {
  showEditModal.value = false;
}

async function updateCategory() {
  if (!editingCategory.value) return;
  if (submitting.value) return;
  submitting.value = true;

  try {
    await $fetch<CategoryUpdateResponse>(`/api/admin/categories/${editingCategory.value.mid}`, {
      method: "PUT",
      body: {
        csrfToken: csrfToken.value,
        name: editCategoryForm.value.name,
        slug: editCategoryForm.value.slug,
        desc: editCategoryForm.value.desc,
      },
    });
    closeEditModal();
    toast.success({ message: "分类更新成功" });
    await fetchCategories();
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    console.error("更新失败:", error);
    let errorMessage = "更新失败";
    if (error?.data?.message) {
      errorMessage = error.data.message;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    toast.error({
      message: errorMessage,
      description: "请稍后重试",
    });
  } finally {
    submitting.value = false;
  }
}

async function deleteCategory(mid: number) {
  // 检查是否是最后一个分类
  if (categories.value.length <= 1) {
    toast.error({
      message: "无法删除",
      description: "至少需要保留一个分类",
    });
    return;
  }
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }

  const confirmed = await confirm({
    title: "删除分类",
    description: "确定要删除这个分类吗？删除后文章将不再关联此分类。",
    variant: "destructive",
    confirmText: "确认删除",
    icon: "lucide:trash-2",
  });
  if (confirmed) {
    try {
      await $fetch<CategoryDeleteResponse>(`/api/admin/categories/${mid}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken.value },
      });
      toast.success({ message: "分类删除成功" });
      await fetchCategories();
    } catch (rawError: unknown) {
      const error = rawError as ApiError;
      console.error("删除失败:", error);
      let errorMessage = "删除失败";
      if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      toast.error({
        message: errorMessage,
        description: "请稍后重试",
      });
    }
  }
}

function viewCategoryContents(category: CategoryItem) {
  router.push(`/admin/contents?category=${category.mid}`);
}

onMounted(() => {
  fetchCategories();
});
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">分类管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理文章分类</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建分类
      </Button>
    </div>

    <Card>
      <!-- 加载状态 - 桌面端表格 -->
      <div v-if="loading" class="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>类型</TableHead>
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
                <div class="h-4 bg-muted rounded w-48 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-6 bg-muted rounded w-16 animate-pulse" />
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
          <TableRow v-for="category in categories" :key="category.mid">
            <TableCell class="font-medium">{{ category.name }}</TableCell>
            <TableCell class="font-mono text-sm text-muted-foreground">{{ category.slug || "-" }}</TableCell>
            <TableCell class="text-muted-foreground">{{ category.desc || "-" }}</TableCell>
            <TableCell>
              <button
                class="flex items-center gap-1 text-sm hover:text-primary transition-colors"
                :class="{ 'text-muted-foreground': category.contentCount === 0 }"
                :disabled="category.contentCount === 0"
                @click="viewCategoryContents(category)">
                <Icon name="lucide:file-text" class="size-4" />
                <span>{{ category.contentCount }}</span>
              </button>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8"
                  title="查看文章"
                  :disabled="category.contentCount === 0"
                  @click="viewCategoryContents(category)">
                  <Icon name="lucide:list" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8" title="编辑" @click="openEditModal(category)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  title="删除"
                  :disabled="categories.length <= 1"
                  @click="deleteCategory(category.mid)">
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
            <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
          </div>
          <div class="flex gap-2">
            <div class="h-6 bg-muted rounded w-12 animate-pulse" />
            <div class="h-4 bg-muted rounded w-8 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 数据列表 - 移动端卡片 -->
      <div v-else class="p-4 lg:hidden space-y-4">
        <div v-for="category in categories" :key="category.mid" class="border rounded-lg p-4 space-y-3">
          <div>
            <h3 class="font-medium text-base">{{ category.name }}</h3>
            <p class="text-sm text-muted-foreground mt-1 font-mono">{{ category.slug || "-" }}</p>
            <p class="text-sm text-muted-foreground mt-1">{{ category.desc || "暂无描述" }}</p>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1 text-sm hover:text-primary transition-colors"
              :class="{ 'text-muted-foreground': category.contentCount === 0 }"
              :disabled="category.contentCount === 0"
              @click="viewCategoryContents(category)">
              <Icon name="lucide:file-text" class="size-3" />
              <span>{{ category.contentCount }} 篇</span>
            </button>
          </div>

          <div class="flex items-center justify-end pt-2 border-t gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="size-8"
              title="查看文章"
              :disabled="category.contentCount === 0"
              @click="viewCategoryContents(category)">
              <Icon name="lucide:list" class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" class="size-8" title="编辑" @click="openEditModal(category)">
              <Icon name="lucide:pencil" class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-8 text-destructive hover:text-destructive"
              title="删除"
              :disabled="categories.length <= 1"
              @click="deleteCategory(category.mid)">
              <Icon name="lucide:trash-2" class="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && categories.length === 0" class="text-center py-12">
        <Icon name="lucide:folder" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无分类</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一个分类
        </Button>
      </div>
    </Card>

    <!-- 添加分类弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建分类</DialogTitle>
          <DialogDescription>创建一个新的文章分类</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addCategory">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="name">名称</Label>
              <Input id="name" v-model="newCategory.name" placeholder="分类名称" required />
            </div>
            <div class="space-y-2">
              <Label for="slug">Slug</Label>
              <Input id="slug" v-model="newCategory.slug" placeholder="英文标识 (如: tech)" />
            </div>
            <div class="space-y-2">
              <Label for="desc">描述</Label>
              <Textarea id="desc" v-model="newCategory.desc" placeholder="分类描述" rows="3" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="closeAddModal"> 取消 </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- 编辑分类弹窗 -->
    <Dialog v-model:open="showEditModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑分类</DialogTitle>
          <DialogDescription>修改分类信息</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="updateCategory">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="edit-name">名称</Label>
              <Input id="edit-name" v-model="editCategoryForm.name" placeholder="分类名称" required />
            </div>
            <div class="space-y-2">
              <Label for="edit-slug">Slug</Label>
              <Input id="edit-slug" v-model="editCategoryForm.slug" placeholder="英文标识 (如: tech)" />
            </div>
            <div class="space-y-2">
              <Label for="edit-desc">描述</Label>
              <Textarea id="edit-desc" v-model="editCategoryForm.desc" placeholder="分类描述" rows="3" />
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
