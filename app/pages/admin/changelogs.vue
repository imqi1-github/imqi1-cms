<script setup lang="ts">
import { CHANGELOG_TYPES, type ChangelogEntry, type ChangelogType, getChangelogMeta } from "#shared/changelog";
import type { CsrfResponse } from "~/types/apis/admin/categories";
import type { ChangelogItem, FormEntry } from "~/types/apis/admin/changelogs/logs";

const toast = useToast();
const { confirm } = useConfirm();
const logs = ref<ChangelogItem[]>([]);
const loading = ref(true);
const submitting = ref(false);
const importing = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const csrfToken = ref("");

// 批量选择与删除
const selectedIds = ref<number[]>([]);
const deleting = ref(false);

// 编辑状态：一条记录可含多个条目（type + value）
const editingId = ref<number | null>(null);

// 编辑表单的条目：带稳定 _key，供 v-for 使用（用 index 作 key 会在增删时串行错位）
let entryKeySeed = 0;
const makeEntry = (type: ChangelogType = "新增", value = ""): FormEntry => ({ _key: ++entryKeySeed, type, value });

const editForm = reactive<{ entries: FormEntry[] }>({
  entries: [makeEntry()],
});

// 是否存在可保存的条目（至少一条 value 非空）
const canSave = computed(() => editForm.entries.some(e => e.value.trim().length > 0));

// 加载更新日志
async function loadLogs() {
  loading.value = true;
  try {
    // 取 CSRF token（写入接口需要）
    const csrfRes = await $fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) csrfToken.value = csrfRes.data.token;
    // 调用管理员专用 API，无缓存，返回原始数据
    logs.value = await $fetch<ChangelogItem[]>("/api/admin/changelogs");
    // 列表重载后清空选择：已删/已变的 id 不再残留在选中集
    selectedIds.value = [];
  } catch (err) {
    console.error("加载失败:", err);
  } finally {
    loading.value = false;
  }
}

// 批量选择：全选 / 单选
const isAllSelected = computed(() => logs.value.length > 0 && selectedIds.value.length === logs.value.length);
const isIndeterminate = computed(() => selectedIds.value.length > 0 && selectedIds.value.length < logs.value.length);

function toggleSelectAll() {
  selectedIds.value = isAllSelected.value ? [] : logs.value.map(l => l.id);
}

function toggleSelect(id: number) {
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(id);
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
  editForm.entries.push(makeEntry());
}

// 删除某条条目（至少保留 1 行，避免空表单）
function removeEntry(index: number) {
  if (editForm.entries.length <= 1) return;
  editForm.entries.splice(index, 1);
}

// 重置为单条空白
function resetForm() {
  editForm.entries = [makeEntry()];
}

// 开始编辑
function startEdit(log: ChangelogItem) {
  editingId.value = log.id;
  const src = Array.isArray(log?.content) ? log.content : [];
  editForm.entries = src.length > 0 ? src.map(c => makeEntry(c.type ?? "新增", c.value ?? "")) : [makeEntry()];
}

// 取消编辑
function cancelEdit() {
  editingId.value = null;
  resetForm();
}

// 保存
async function save() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  // 过滤掉 value 空行
  const entries: ChangelogEntry[] = editForm.entries.map(e => ({ type: e.type, value: e.value.trim() })).filter(e => e.value.length > 0);

  if (entries.length === 0) {
    toast.error({ message: "内容不能为空" });
    return;
  }

  submitting.value = true;
  try {
    if (editingId.value) {
      await $fetch(`/api/admin/changelogs/${editingId.value}`, {
        method: "PUT",
        body: { content: entries, csrfToken: csrfToken.value },
      });
      toast.success({ message: "更新成功" });
    } else {
      await $fetch("/api/admin/changelogs", {
        method: "POST",
        body: { content: entries, csrfToken: csrfToken.value },
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

// 批量删除选中的更新日志
async function batchDelete() {
  if (selectedIds.value.length === 0) return;
  if (
    !(await confirm({
      title: "批量删除更新日志",
      description: `确定要删除选中的 ${selectedIds.value.length} 条更新日志吗？`,
      variant: "destructive",
      confirmText: "确认删除",
      icon: "lucide:trash-2",
    }))
  ) {
    return;
  }

  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }

  deleting.value = true;
  try {
    const res = await $fetch<{ message?: string }>("/api/admin/changelogs/batch-delete", {
      method: "POST",
      body: { ids: selectedIds.value, csrfToken: csrfToken.value },
    });
    toast.success({ message: res.message || "批量删除成功" });
    selectedIds.value = [];
    await loadLogs();
  } catch (err) {
    console.error("批量删除失败:", err);
    toast.error({ message: "批量删除失败" });
  } finally {
    deleting.value = false;
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
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }

  importing.value = true;
  try {
    const source = await file.text();
    const res = await $fetch<{ imported?: number }>("/api/admin/changelogs/import", {
      method: "POST",
      body: { source, csrfToken: csrfToken.value },
    });

    toast.success({
      message: res?.imported ? `导入成功，共 ${res.imported} 条记录` : "导入成功",
    });
    await loadLogs();
  } catch (err: unknown) {
    console.error("导入失败:", err);
    const data = err && typeof err === "object" && "data" in err ? (err as { data?: unknown }).data : undefined;
    const msg =
      data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "导入失败，请检查 JSON 格式";
    toast.error({ message: msg });
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
          <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" >
          <Button
            v-tooltip.bottom="'JSON 格式：条目数组 [{ type, value }, ...]，一个文件 = 一条记录；多条记录可用 [{ entries: [...] }, ...]'"
            variant="outline"
            size="sm"
            :disabled="importing"
            @click="triggerImport">
            <Icon :name="importing ? 'lucide:loader-2' : 'lucide:upload'" class="mr-1 size-4" :class="importing ? 'animate-spin' : ''" />
            {{ importing ? "导入中..." : "导入 JSON" }}
          </Button>
        </div>
      </div>

      <!-- 添加表单 -->
      <Card v-if="editingId === null" class="p-4">
        <form class="space-y-3" @submit.prevent="save">
          <!-- 条目编辑器：可重复行 -->
          <div class="space-y-2">
            <template v-for="(entry, index) in editForm.entries" :key="entry._key">
              <div class="flex flex-wrap items-start gap-2 max-md:justify-between max-md:items-center">
                <div class="w-28 shrink-0">
                  <label class="block text-xs font-medium mb-1 text-muted-foreground">类型</label>
                  <ClientOnly>
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
                    <template #fallback>
                      <div class="h-9 bg-muted rounded-md animate-pulse" />
                    </template>
                  </ClientOnly>
                </div>
                <div class="flex-1 min-w-0 max-md:order-last max-md:basis-full">
                  <label class="block text-xs font-medium mb-1 text-muted-foreground">内容</label>
                  <Textarea v-model="entry.value" placeholder="输入更新内容，支持 Markdown 格式" rows="2" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="max-xs:ml-auto mt-6 size-8 shrink-0 max-xs:mt-0"
                  :disabled="editForm.entries.length <= 1"
                  @click="removeEntry(index)">
                  <Icon name="lucide:x" class="size-4" />
                </Button>
              </div>
            </template>
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
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>

      <!-- 日志列表 -->
      <div v-else-if="logs.length > 0" class="space-y-2">
        <!-- 工具栏：全选 + 批量删除（删除改为选中后批量进行） -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Checkbox :model-value="isAllSelected" :indeterminate="isIndeterminate" @update:model-value="toggleSelectAll" />
            <span class="text-sm cursor-pointer select-none" @click="toggleSelectAll">全选</span>
          </div>
          <Button v-if="selectedIds.length > 0" variant="destructive" size="sm" :disabled="deleting" @click="batchDelete">
            <Icon :name="deleting ? 'lucide:loader-2' : 'lucide:trash-2'" class="mr-1 size-4" :class="deleting ? 'animate-spin' : ''" />
            {{ deleting ? "删除中..." : `删除选中 (${selectedIds.length})` }}
          </Button>
        </div>

        <Card v-for="log in logs" :key="log.id" class="p-3" :class="{ 'ring-2 ring-primary': editingId === log.id, 'bg-muted/50': selectedIds.includes(log.id) }">
          <!-- 编辑模式 -->
          <form v-if="editingId === log.id" class="space-y-3" @submit.prevent="save">
            <div class="space-y-2">
              <div v-for="(entry, index) in editForm.entries" :key="entry._key" class="rounded-lg border p-3">
                <div class="flex flex-wrap items-start gap-2 max-md:justify-between max-md:items-center">
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
                  <div class="flex-1 min-w-0 max-md:order-last max-md:basis-full">
                    <label class="block text-xs font-medium mb-1 text-muted-foreground">内容</label>
                    <Textarea v-model="entry.value" placeholder="输入更新内容，支持 Markdown 格式" rows="2" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="max-xs:ml-auto mt-6 size-8 shrink-0 max-xs:mt-0"
                    :disabled="editForm.entries.length <= 1"
                    @click="removeEntry(index)">
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
          <div v-else class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <Checkbox :model-value="selectedIds.includes(log.id)" @update:model-value="toggleSelect(log.id)" />
                <span class="text-xs text-muted-foreground">
                  {{ formatDate(log.createTime) }}
                </span>
              </div>
              <div class="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" class="size-8" @click="startEdit(log)">
                  <Icon name="lucide:pencil" class="size-3.5" />
                </Button>
              </div>
            </div>
            <div class="space-y-2">
              <div v-for="(entry, i) in log.content" :key="i" class="flex flex-col-reverse items-start gap-1 sm:flex-row sm:items-baseline sm:gap-2">
                <span
                  :class="['shrink-0 px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1', getChangelogMeta(entry.type).color]">
                  <Icon :name="getChangelogMeta(entry.type).icon" class="size-3" />
                  {{ getChangelogMeta(entry.type).label }}
                </span>
                <div
                  class="prose prose-slate dark:prose-invert max-w-none prose-p:text-xs markdown-content w-full min-w-0 sm:flex-1"
                  v-html="entry.html" />
              </div>
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
  font-family: var(--font-mono);
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
