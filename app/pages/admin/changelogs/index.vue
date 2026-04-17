<script setup lang="ts">
const toast = useToast();
const logs = ref<any[]>([]);
const loading = ref(true);
const submitting = ref(false);

// 编辑状态
const editingId = ref<number | null>(null);
const editForm = reactive({
  class: "新增",
  desc: "",
});

// 分类选项
const classOptions = ["新增", "优化", "修复", "删除", "重构"];

// 加载更新日志
async function loadLogs() {
  loading.value = true;
  try {
    // 调用管理员专用 API，无缓存，返回原始数据
    const response = (await $fetch("/api/admin/changelogs")) as any;
    logs.value = response;
  } catch (err) {
    console.error("加载失败:", err);
  } finally {
    loading.value = false;
  }
}

// 格式化日期
function formatDate(dateStr: string | Date) {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 获取分类颜色
function getClassColor(classType: string) {
  const colors: Record<string, string> = {
    新增: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    优化: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    修复: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    删除: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    重构: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return colors[classType] || "bg-gray-100 text-gray-700";
}

// 开始编辑
function startEdit(log: any) {
  editingId.value = log.id;
  editForm.class = log.class;
  editForm.desc = log.desc;
}

// 取消编辑
function cancelEdit() {
  editingId.value = null;
  editForm.class = "新增";
  editForm.desc = "";
}

// 保存
async function save() {
  if (!editForm.desc.trim()) {
    return;
  }

  submitting.value = true;
  try {
    if (editingId.value) {
      await $fetch(`/api/admin/changelog/${editingId.value}`, {
        method: "PUT",
        body: {
          class: editForm.class,
          desc: editForm.desc,
        },
      });
      toast.success({
        message: "更新成功",
      });
    } else {
      await $fetch("/api/admin/changelog", {
        method: "POST",
        body: {
          class: editForm.class,
          desc: editForm.desc,
        },
      });
      toast.success({
        message: "添加成功",
      });
    }
    await loadLogs();
    cancelEdit();
  } catch (err) {
    console.error("保存失败:", err);
    toast.error({
      message: editingId.value ? "更新失败" : "添加失败",
    });
  } finally {
    submitting.value = false;
  }
}

// 删除
async function deleteLog(id: number) {
  if (!confirm("确定要删除这条更新日志吗？")) {
    return;
  }

  try {
    await $fetch(`/api/admin/changelog/${id}`, {
      method: "DELETE",
    });
    toast.success({
      message: "删除成功",
    });
    await loadLogs();
  } catch (err) {
    console.error("删除失败:", err);
    toast.error({
      message: "删除失败",
    });
  }
}

onMounted(() => {
  loadLogs();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-4">
      <!-- 页面标题 -->
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">更新日志管理</h1>
      </div>

      <!-- 添加/编辑表单 -->
      <Card v-if="editingId === null" class="p-4">
        <form @submit.prevent="save" class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1.5">分类</label>
              <Select v-model="editForm.class">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in classOptions" :key="option" :value="option">
                    {{ option }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="md:col-span-3">
              <label class="block text-sm font-medium mb-1.5">内容</label>
              <Textarea v-model="editForm.desc" placeholder="输入更新内容，支持 Markdown 格式" rows="2" required />
            </div>
          </div>
          <div class="flex justify-end">
            <Button type="submit" :disabled="submitting || !editForm.desc.trim()">
              <Icon v-if="submitting" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
              {{ submitting ? "提交中..." : "添加" }}
            </Button>
          </div>
        </form>
      </Card>

      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>

      <!-- 日志列表 -->
      <div v-else-if="logs.length > 0" class="space-y-2">
        <Card v-for="log in logs" :key="log.id" class="p-3" :class="{ 'ring-2 ring-primary': editingId === log.id }">
          <!-- 编辑模式 -->
          <form v-if="editingId === log.id" @submit.prevent="save" class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block text-sm font-medium mb-1.5">分类</label>
                <Select v-model="editForm.class">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="option in classOptions" :key="option" :value="option">
                      {{ option }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm font-medium mb-1.5">内容</label>
                <Textarea v-model="editForm.desc" placeholder="输入更新内容，支持 Markdown 格式" rows="2" required />
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <Button type="button" variant="outline" @click="cancelEdit"> 取消 </Button>
              <Button type="submit" :disabled="submitting || !editForm.desc.trim()">
                <Icon v-if="submitting" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
                {{ submitting ? "保存中..." : "保存" }}
              </Button>
            </div>
          </form>

          <!-- 显示模式 -->
          <div v-else class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span :class="['px-2 py-0.5 rounded text-xs font-medium', getClassColor(log.class)]">
                  {{ log.class }}
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ formatDate(log.create_time) }}
                </span>
              </div>
              <div class="prose prose-slate dark:prose-invert max-w-none prose-p:text-xs markdown-content" v-html="log.descHtml" />
            </div>
            <div class="flex gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" class="size-8" @click="startEdit(log)">
                <Icon name="lucide:pencil" class="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" class="size-8" @click="deleteLog(log.id)">
                <Icon name="lucide:trash-2" class="size-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <!-- 空状态 -->
      <div v-else class="py-20 text-center">
        <Icon name="lucide:file-text" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无更新日志</p>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
/* Markdown 内容样式 */
.markdown-content > * {
  line-height: 1.5;
}

.markdown-content :deep(p) {
  margin-top: 0;
  margin-bottom: 0.5rem;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(strong) {
  font-weight: 700;
  color: rgb(15 23 42); /* slate-900 */
}

.markdown-content :deep(.dark strong) {
  color: rgb(226 232 240); /* slate-200 */
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(s) {
  text-decoration: line-through;
  color: rgb(100 116 139); /* slate-500 */
}

.markdown-content :deep(.dark s) {
  color: rgb(148 163 184); /* slate-400 */
}

.markdown-content :deep(code) {
  background-color: rgb(241 245 249); /* slate-100 */
  color: rgb(15 23 42); /* slate-900 */
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
  font-family: JetBrains Mono, monospace;
}

.markdown-content :deep(.dark code) {
  background-color: rgb(30 41 59); /* slate-800 */
  color: rgb(226 232 240); /* slate-200 */
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.25em;
  margin-top: 0;
}

.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
}

.markdown-content :deep(li::marker) {
  color: rgb(100 116 139); /* slate-500 */
}

.markdown-content :deep(.dark li::marker) {
  color: rgb(148 163 184); /* slate-400 */
}
</style>
