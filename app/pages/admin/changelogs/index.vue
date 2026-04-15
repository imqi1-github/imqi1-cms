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
    const response = (await $fetch("/api/changelog")) as any;
    // 展开所有月份的日志
    logs.value = response.data.flatMap((group: any) =>
      group.logs.map((log: any) => ({
        ...log,
        year: group.year,
        month: group.month,
      })),
    );
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
    <div class="space-y-6">
      <!-- 页面标题 -->
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">更新日志管理</h1>
      </div>

      <!-- 添加/编辑表单 -->
      <Card v-if="editingId === null" class="p-6">
        <form @submit.prevent="save" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">分类</label>
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
              <label class="block text-sm font-medium mb-2">内容</label>
              <Textarea v-model="editForm.desc" placeholder="输入更新内容，支持 Markdown 格式" rows="3" required />
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
      <div v-else-if="logs.length > 0" class="space-y-4">
        <Card v-for="log in logs" :key="log.id" class="p-6" :class="{ 'ring-2 ring-primary': editingId === log.id }">
          <!-- 编辑模式 -->
          <form v-if="editingId === log.id" @submit.prevent="save" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2">分类</label>
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
                <label class="block text-sm font-medium mb-2">内容</label>
                <Textarea v-model="editForm.desc" placeholder="输入更新内容，支持 Markdown 格式" rows="3" required />
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
          <div v-else class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <span :class="['px-2.5 py-1 rounded-md text-xs font-medium', getClassColor(log.class)]">
                  {{ log.class }}
                </span>
                <span class="text-sm text-muted-foreground">
                  {{ formatDate(log.createTime) }}
                </span>
              </div>
              <div class="prose prose-slate dark:prose-invert max-w-none prose-p:text-sm" v-html="log.desc" />
            </div>
            <div class="flex gap-2">
              <Button variant="ghost" size="icon" @click="startEdit(log)">
                <Icon name="lucide:pencil" class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" @click="deleteLog(log.id)">
                <Icon name="lucide:trash-2" class="size-4 text-destructive" />
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
