<script setup lang="ts">
import {
  CHANGELOG_TYPES,
  getChangelogMeta,
  type ChangelogEntry,
} from "~~/shared/changelog";

const toast = useToast();
const logs = ref<any[]>([]);
const loading = ref(true);
const submitting = ref(false);
const importing = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// 编辑状态：一条记录可含多个条目（type + value）
const editingId = ref<number | null>(null);
const editForm = reactive<{ entries: ChangelogEntry[] }>({
  entries: [{ type: "新增", value: "" }],
});

// 是否存在可保存的条目（至少一条 value 非空）
const canSave = computed(() => editForm.entries.some(e => e.value.trim().length > 0));

// 加载更新日志
async function loadLogs() {
  loading.value = true;
  try {
    // 调用管理员专用 API，无缓存，返回原始数据
    const response = (await ($fetch as any)("/api/admin/changelogs")) as any;
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

// 添加一条空白条目
function addEntry() {
  editForm.entries.push({ type: "新增", value: "" });
}

// 删除某条条目（至少保留 1 行，避免空表单）
function removeEntry(index: number) {
  if (editForm.entries.length <= 1) return;
  editForm.entries.splice(index, 1);
}

// 重置为单条空白
function resetForm() {
  editForm.entries = [{ type: "新增", value: "" }];
}

// 开始编辑
function startEdit(log: any) {
  editingId.value = log.id;
  const src = Array.isArray(log?.content) ? log.content : [];
  editForm.entries =
    src.length > 0
      ? src.map((c: any) => ({
          type: c.type ?? "新增",
          value: c.value ?? "",
        }))
      : [{ type: "新增", value: "" }];
}

// 取消编辑
function cancelEdit() {
  editingId.value = null;
  resetForm();
}

// 保存
async function save() {
  // 过滤掉 value 空行
  const entries: ChangelogEntry[] = editForm.entries
    .map(e => ({ type: e.type, value: e.value.trim() }))
    .filter(e => e.value.length > 0);

  if (entries.length === 0) {
    toast.error({ message: "内容不能为空" });
    return;
  }

  submitting.value = true;
  try {
    if (editingId.value) {
      await $fetch(`/api/admin/changelogs/${editingId.value}`, {
        method: "PUT",
        body: { content: entries },
      });
      toast.success({ message: "更新成功" });
    } else {
      await $fetch("/api/admin/changelogs", {
        method: "POST",
        body: { content: entries },
      });
      toast.success({ message: "添加成功" });
    }
    await loadLogs();
    cancelEdit();
  } catch (err) {
    console.error("保存失败:", err);
    toast.error({ message: editingId.value ? "更新失败" : "添加失败" });
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
    await $fetch(`/api/admin/changelogs/${id}`, {
      method: "DELETE",
    });
    toast.success({ message: "删除成功" });
    await loadLogs();
  } catch (err) {
    console.error("删除失败:", err);
    toast.error({ message: "删除失败" });
  }
}

// 触发隐藏的文件选择框
function triggerImport() {
  fileInput.value?.click();
}

// 导入 JSON：读取文件文本 → 后端解析入库 → 刷新列表
async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importing.value = true;
  try {
    const source = await file.text();
    const res = (await $fetch("/api/admin/changelogs/import", {
      method: "POST",
      body: { source },
    })) as { imported?: number };

    toast.success({
      message: res?.imported ? `导入成功，共 ${res.imported} 条记录` : "导入成功",
    });
    await loadLogs();
  } catch (err: any) {
    console.error("导入失败:", err);
    toast.error({
      message: err?.data?.message || "导入失败，请检查 JSON 格式",
    });
  } finally {
    importing.value = false;
    // 清空 value，便于重复选择同一个文件
    input.value = "";
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
        <div>
          <h1 class="text-2xl font-bold">更新日志管理</h1>
          <p class="text-sm text-muted-foreground mt-1">管理站点更新日志内容</p>
        </div>
        <div class="flex items-center gap-2">
          <input
            ref="fileInput"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onImportFile"
          />
          <Button
            variant="outline"
            size="sm"
            :disabled="importing"
            v-tooltip.bottom="
              'JSON 格式：条目数组 [{ type, value }, ...]，一个文件 = 一条记录；多条记录可用 [{ entries: [...] }, ...]'
            "
            @click="triggerImport"
          >
            <Icon
              :name="importing ? 'lucide:loader-2' : 'lucide:upload'"
              class="mr-1 size-4"
              :class="importing ? 'animate-spin' : ''"
            />
            {{ importing ? "导入中..." : "导入 JSON" }}
          </Button>
        </div>
      </div>

      <!-- 添加表单 -->
      <Card v-if="editingId === null" class="p-4">
        <form @submit.prevent="save" class="space-y-3">
          <!-- 条目编辑器：可重复行 -->
          <div class="space-y-2">
            <div
              v-for="(entry, index) in editForm.entries"
              :key="index"
              class="rounded-lg border p-3"
            >
              <div class="flex items-start gap-2">
                <div class="w-28 shrink-0">
                  <label class="block text-xs font-medium mb-1 text-muted-foreground">类型</label>
                  <Select v-model="entry.type">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in CHANGELOG_TYPES" :key="option" :value="option">
                        {{ option }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="flex-1 min-w-0">
                  <label class="block text-xs font-medium mb-1 text-muted-foreground">内容</label>
                  <Textarea
                    v-model="entry.value"
                    placeholder="输入更新内容，支持 Markdown 格式"
                    rows="2"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="mt-6 size-8 shrink-0"
                  :disabled="editForm.entries.length <= 1"
                  @click="removeEntry(index)"
                >
                  <Icon name="lucide:x" class="size-4" />
                </Button>
              </div>
            </div>
          </div>
          <div class="flex justify-between">
            <Button type="button" variant="outline" size="sm" @click="addEntry">
              <Icon name="lucide:plus" class="mr-1 size-4" />
              添加条目
            </Button>
            <Button type="submit" :disabled="submitting || !canSave">
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
            <div class="space-y-2">
              <div
                v-for="(entry, index) in editForm.entries"
                :key="index"
                class="rounded-lg border p-3"
              >
                <div class="flex items-start gap-2">
                  <div class="w-28 shrink-0">
                    <label class="block text-xs font-medium mb-1 text-muted-foreground">类型</label>
                    <Select v-model="entry.type">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="option in CHANGELOG_TYPES" :key="option" :value="option">
                          {{ option }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="flex-1 min-w-0">
                    <label class="block text-xs font-medium mb-1 text-muted-foreground">内容</label>
                    <Textarea
                      v-model="entry.value"
                      placeholder="输入更新内容，支持 Markdown 格式"
                      rows="2"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="mt-6 size-8 shrink-0"
                    :disabled="editForm.entries.length <= 1"
                    @click="removeEntry(index)"
                  >
                    <Icon name="lucide:x" class="size-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div class="flex justify-between">
              <Button type="button" variant="outline" size="sm" @click="addEntry">
                <Icon name="lucide:plus" class="mr-1 size-4" />
                添加条目
              </Button>
              <div class="flex gap-2">
                <Button type="button" variant="outline" @click="cancelEdit"> 取消 </Button>
                <Button type="submit" :disabled="submitting || !canSave">
                  <Icon v-if="submitting" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
                  {{ submitting ? "保存中..." : "保存" }}
                </Button>
              </div>
            </div>
          </form>

          <!-- 显示模式 -->
          <div v-else class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0 space-y-1.5">
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground">
                  {{ formatDate(log.createTime) }}
                </span>
              </div>
              <div
                v-for="(entry, i) in log.content"
                :key="i"
                class="flex items-baseline gap-2"
              >
                <span
                  :class="[
                    'shrink-0 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1',
                    getChangelogMeta(entry.type).color,
                  ]"
                >
                  <Icon :name="getChangelogMeta(entry.type).icon" class="size-3" />
                  {{ getChangelogMeta(entry.type).label }}
                </span>
                <div
                  class="prose prose-slate dark:prose-invert max-w-none prose-p:text-xs markdown-content flex-1 min-w-0"
                  v-html="entry.html"
                />
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
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
