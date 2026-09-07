<script setup lang="ts">
import type {SubscribeItem, SubscribesUpdateResponse, SubscriptionStats} from "~/types/apis/admin/subscribe";
import type { CsrfResponse } from "~/types/apis/admin/categories";

const toast = useToast();
const { confirm } = useConfirm();
const subscribes = ref<SubscribeItem[]>([]);
const loading = ref(true);
const hasLoadedSubscribes = ref(false);
const showAddForm = ref(false);
const submitting = ref(false); // 添加订阅表单提交中
const taskSubmitting = ref(false); // 提交更新订阅任务中
const refreshing = ref(false); // 刷新订阅列表中
const saveUpdating = ref(false); // 编辑订阅保存中
const feedCacheInterval = ref(8); // 默认8小时
const csrfToken = ref("");
const loadSeq = ref(0);
const subscriptionStats = ref<SubscriptionStats>({ updateCount: 0, lastRunAt: null, successCount: 0, failureCount: 0 });

const newSubscribe = ref({ name: "", url: "", avatar: "" });
const editingSubscribe = ref<{ id: number | null; name: string; url: string; avatar: string }>({
  id: null,
  name: "",
  url: "",
  avatar: "",
});

// 加载站点设置
async function loadSettings() {
  try {
    const settings = await $fetch<Record<string, string | number | boolean>>("/api/admin/settings");
    if (settings && settings.feedCacheInterval) {
      feedCacheInterval.value = Number(settings.feedCacheInterval);
    }
  } catch (error) {
    console.error("获取设置失败:", error);
  }
}

// 加载订阅列表。showSkeleton=true 走骨架屏（首载/变更后），false 用于「刷新订阅状态」按钮，不闪骨架。
async function loadSubscribes(showSkeleton = true): Promise<boolean> {
  if (showSkeleton) loading.value = true;
  const seq = ++loadSeq.value;
  try {
    const csrfRes = await $fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) csrfToken.value = csrfRes.data.token;
    const [data, stats] = await Promise.all([
      $fetch<SubscribeItem[]>("/api/admin/subscribes"),
      $fetch<SubscriptionStats>("/api/admin/subscribes/stats").catch(() => null),
    ]);
    if (seq !== loadSeq.value) return false;
    subscribes.value = data;
    if (stats) subscriptionStats.value = stats;
    return true;
  } catch (error) {
    console.error("获取订阅失败:", error);
    if (seq !== loadSeq.value) return false;
    subscribes.value = [];
    return false;
  } finally {
    if (seq === loadSeq.value) {
      hasLoadedSubscribes.value = true;
      loading.value = false;
    }
  }
}

async function addSubscribe() {
  if (submitting.value) return;
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  submitting.value = true;
  try {
    await $fetch("/api/admin/subscribes", {
      method: "POST",
      body: {
        ...newSubscribe.value,
        csrfToken: csrfToken.value,
      },
    });
    newSubscribe.value = { name: "", url: "", avatar: "" };
    showAddForm.value = false;
    toast.success({
      message: "添加成功",
    });
    await loadSubscribes();
  } catch (error) {
    console.error("添加失败:", error);
    toast.error({
      message: "添加失败",
    });
  } finally {
    submitting.value = false;
  }
}

async function deleteSubscribe(id: number) {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  const confirmed = await confirm({
    title: "删除订阅",
    description: "确定要删除这个订阅源吗？其关联的文章将一并移除，且不可恢复。",
    variant: "destructive",
    confirmText: "确认删除",
    icon: "lucide:trash-2",
  });
  if (!confirmed) return;
  try {
    await $fetch(`/api/admin/subscribes/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken.value },
    });
    toast.success({
      message: "删除成功",
    });
    await loadSubscribes();
  } catch (error) {
    console.error("删除失败:", error);
    toast.error({
      message: "删除失败",
    });
  }
}

// 提交更新订阅任务：不等后台抓取完成，立即响应；后台跑一次定时任务的等价操作（更新所有订阅文章）。
async function submitUpdateTask() {
  if (taskSubmitting.value) return;
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  taskSubmitting.value = true;
  try {
    const res = await $fetch<SubscribesUpdateResponse>("/api/admin/subscribes/update", {
      method: "POST",
      body: { csrfToken: csrfToken.value },
    });
    if (!res?.success) throw new Error("提交失败");
    toast.success({ message: "更新订阅任务已提交", description: "后台正在更新全部订阅，稍后点「刷新订阅状态」获取最新结果" });
  } catch (error) {
    console.error("提交更新订阅任务失败:", error);
    toast.error({ message: "提交更新订阅任务失败" });
  } finally {
    taskSubmitting.value = false;
  }
}

// 不刷新页面、仅重新拉取订阅列表状态（更新任务完成后的 lastUpdated 变更在此体现）
async function refreshData() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const ok = await loadSubscribes(false);
    if (!ok) {
      toast.error({ message: "刷新失败，请稍后重试" });
      return;
    }
    toast.success({ message: "刷新成功" });
  } finally {
    refreshing.value = false;
  }
}

function cancelAdd() {
  newSubscribe.value = { name: "", url: "", avatar: "" };
  showAddForm.value = false;
}

function openEditForm(subscribe: SubscribeItem) {
  editingSubscribe.value = {
    id: subscribe.id,
    name: subscribe.name,
    url: subscribe.url,
    avatar: subscribe.avatar || "",
  };
}

async function updateSubscribe() {
  if (!editingSubscribe.value.id) return;
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  if (saveUpdating.value) return;

  saveUpdating.value = true;
  try {
    await $fetch(`/api/admin/subscribes/${editingSubscribe.value.id}`, {
      method: "PUT",
      body: {
        name: editingSubscribe.value.name,
        url: editingSubscribe.value.url,
        avatar: editingSubscribe.value.avatar,
        csrfToken: csrfToken.value,
      },
    });
    editingSubscribe.value = { id: null, name: "", url: "", avatar: "" };
    toast.success({
      message: "修改成功",
    });
    await loadSubscribes();
  } catch (error) {
    console.error("修改失败:", error);
    toast.error({
      message: "修改失败",
    });
  } finally {
    saveUpdating.value = false;
  }
}

function cancelEdit() {
  editingSubscribe.value = { id: null, name: "", url: "", avatar: "" };
}

function formatDate(date: Date | string | null) {
  if (date instanceof Date) {
    return date.toLocaleDateString("zh-CN");
  }

  if (!date) return "从未更新";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 1) {
    return "刚刚更新";
  } else if (hours < 24) {
    return `${hours}小时前更新`;
  } else if (days < 7) {
    return `${days}天前更新`;
  } else {
    return d.toLocaleDateString("zh-CN");
  }
}

// 订阅更新统计的「上次刷新」相对时间：无记录显示 —
function formatStatsTime(ts: number | null | undefined) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

onMounted(() => {
  loadSettings();
  loadSubscribes();
});
</script>

<template>
  <AdminLayout>
    <div class="mb-6">
      <h2 class="text-2xl font-bold">订阅列表</h2>
      <p class="text-sm text-muted-foreground mt-1">管理 RSS 订阅源，每{{ feedCacheInterval }}小时自动更新。提交更新订阅=立刻跑一次自动更新；刷新订阅状态=仅重新拉取列表</p>
      <p class="text-xs text-muted-foreground mt-2">
        已更新 {{ subscriptionStats.updateCount }} 次 · 上次刷新 {{ formatStatsTime(subscriptionStats.lastRunAt) }} · 成功 {{ subscriptionStats.successCount }} · 失败 {{ subscriptionStats.failureCount }}
      </p>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>订阅源</CardTitle>
            <CardDescription>管理和配置 RSS 订阅源</CardDescription>
          </div>
          <div class="flex gap-2 max-xs:flex-col">
            <Button variant="outline" :disabled="taskSubmitting" @click="submitUpdateTask">
              <Icon :name="taskSubmitting ? 'lucide:loader-2' : 'lucide:play'" :class="{ 'animate-spin': taskSubmitting }" class="mr-2 size-4" />
              {{ taskSubmitting ? "提交中..." : "提交更新订阅" }}
            </Button>
            <Button variant="outline" :disabled="refreshing" @click="refreshData">
              <Icon :name="refreshing ? 'lucide:loader-2' : 'lucide:refresh-cw'" :class="{ 'animate-spin': refreshing }" class="mr-2 size-4" />
              {{ refreshing ? "刷新中..." : "刷新订阅状态" }}
            </Button>
            <Button @click="showAddForm = true">
              <Icon name="lucide:plus" class="mr-2 size-4" />
              添加订阅
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <!-- 添加表单 -->
        <div v-if="showAddForm" class="mb-6 p-4 border rounded-lg bg-muted/30">
          <h4 class="font-medium mb-4">添加新订阅</h4>
          <form class="grid grid-cols-1 md:grid-cols-4 gap-4" @submit.prevent="addSubscribe">
            <Input v-model="newSubscribe.name" placeholder="订阅名称" required />
            <Input v-model="newSubscribe.url" type="url" placeholder="RSS URL" required />
            <Input v-model="newSubscribe.avatar" type="url" placeholder="头像 URL（可选）" />
            <div class="flex gap-2">
              <Button type="submit">添加</Button>
              <Button type="button" variant="outline" @click="cancelAdd">取消</Button>
            </div>
          </form>
        </div>

        <!-- 编辑表单：内联在被编辑的原始行位置 -->

        <!-- 订阅列表 -->
        <!-- 加载状态 - 桌面端表格 -->
        <div v-if="loading" class="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>订阅源</TableHead>
                <TableHead>更新状态</TableHead>
                <TableHead>最后更新</TableHead>
                <TableHead class="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="i in 5" :key="i">
                <TableCell>
                  <div class="flex items-center gap-3">
                    <div class="size-8 bg-muted rounded-full animate-pulse" />
                    <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                  </div>
                </TableCell>
                <TableCell>
                  <div class="h-4 bg-muted rounded w-48 animate-pulse" />
                </TableCell>
                <TableCell>
                  <div class="h-4 bg-muted rounded w-32 animate-pulse" />
                </TableCell>
                <TableCell>
                  <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-1">
                    <div class="size-8 bg-muted rounded-lg animate-pulse" />
                    <div class="size-8 bg-muted rounded-lg animate-pulse" />
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- 数据列表 - 桌面端表格 -->
        <Table v-else-if="hasLoadedSubscribes && subscribes.length > 0" class="hidden lg:table">
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>订阅源</TableHead>
              <TableHead>更新状态</TableHead>
              <TableHead>最后更新</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="sub in subscribes" :key="sub.id">
              <!-- 编辑行：内联替换被编辑的原始行 -->
              <TableRow v-if="editingSubscribe.id === sub.id" class="bg-primary/5">
                <TableCell :colspan="5">
                  <form class="grid grid-cols-1 md:grid-cols-4 gap-4 py-2" @submit.prevent="updateSubscribe">
                    <Input v-model="editingSubscribe.name" placeholder="订阅名称" required />
                    <Input v-model="editingSubscribe.url" type="url" placeholder="RSS URL" required />
                    <Input v-model="editingSubscribe.avatar" type="url" placeholder="头像 URL（可选）" />
                    <div class="flex gap-2">
                      <Button type="submit" :disabled="saveUpdating">保存</Button>
                      <Button type="button" variant="outline" @click="cancelEdit">取消</Button>
                    </div>
                  </form>
                </TableCell>
              </TableRow>
              <TableRow v-else>
                <TableCell>
                  <div class="flex items-center gap-3">
                    <Avatar class="size-8">
                      <AvatarImage v-if="sub.avatar" :src="sub.avatar" class="no-img-loading" />
                      <AvatarFallback>{{ sub.name?.charAt(0) || "?" }}</AvatarFallback>
                    </Avatar>
                    <span class="font-medium">{{ sub.name }}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <a :href="sub.url" target="_blank" class="text-primary hover:underline truncate block max-w-75">
                    {{ sub.url }}
                  </a>
                </TableCell>
                <TableCell>
                  <!-- 最近一次更新状态：成功=文章数+最新标题，失败=报错信息，无记录=— -->
                  <span v-if="sub.lastUpdateStatus" class="text-xs">
                    <template v-if="sub.lastUpdateStatus.success">
                      <span class="text-green-600 dark:text-green-400">{{ sub.lastUpdateStatus.message }}</span>
                      <span v-if="sub.lastUpdateStatus.latestTitle" class="text-muted-foreground block truncate max-w-60 mt-0.5">
                        最新：{{ sub.lastUpdateStatus.latestTitle }}
                      </span>
                    </template>
                    <span v-else class="text-destructive">{{ sub.lastUpdateStatus.message }}</span>
                  </span>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">
                  {{ formatDate(sub.lastUpdated) }}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" class="size-8" @click="openEditForm(sub)">
                      <Icon name="lucide:pencil" class="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deleteSubscribe(sub.id)">
                      <Icon name="lucide:trash-2" class="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>

        <!-- 加载状态 - 移动端卡片 -->
        <div v-if="loading" class="lg:hidden space-y-4">
          <div v-for="i in 5" :key="i" class="flex items-center gap-4 p-4 border rounded-lg">
            <div class="size-12 bg-muted rounded-full animate-pulse shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="h-4 bg-muted rounded w-32 animate-pulse mb-1" />
              <div class="h-4 bg-muted rounded w-48 animate-pulse" />
              <div class="h-3 bg-muted rounded w-40 animate-pulse mt-1" />
            </div>
            <div class="flex flex-col items-end gap-2 shrink-0">
              <div class="h-3 bg-muted rounded w-20 animate-pulse" />
              <div class="flex gap-1">
                <div class="size-8 bg-muted rounded-lg animate-pulse" />
                <div class="size-8 bg-muted rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        <!-- 数据列表 - 移动端卡片 -->
        <div v-else-if="hasLoadedSubscribes && subscribes.length > 0" class="lg:hidden space-y-4">
          <template v-for="sub in subscribes" :key="sub.id">
            <!-- 编辑卡片：内联替换被编辑的原始卡片 -->
            <div v-if="editingSubscribe.id === sub.id" class="p-4 border rounded-lg bg-primary/5 border-primary/50">
              <form class="grid grid-cols-1 gap-4" @submit.prevent="updateSubscribe">
                <Input v-model="editingSubscribe.name" placeholder="订阅名称" required />
                <Input v-model="editingSubscribe.url" type="url" placeholder="RSS URL" required />
                <Input v-model="editingSubscribe.avatar" type="url" placeholder="头像 URL（可选）" />
                <div class="flex gap-2">
                  <Button type="submit" :disabled="saveUpdating">保存</Button>
                  <Button type="button" variant="outline" @click="cancelEdit">取消</Button>
                </div>
              </form>
            </div>
            <div v-else class="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
              <Avatar class="size-12">
                <AvatarImage v-if="sub.avatar" :src="sub.avatar" />
                <AvatarFallback class="text-sm">{{ sub.name?.charAt(0) || "?" }}</AvatarFallback>
              </Avatar>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-base">{{ sub.name }}</p>
                <a :href="sub.url" target="_blank" class="text-sm text-primary hover:underline truncate block">
                  {{ sub.url }}
                </a>
                <!-- 最近一次更新状态 -->
                <p class="text-xs mt-1 truncate">
                  <template v-if="sub.lastUpdateStatus">
                    <template v-if="sub.lastUpdateStatus.success">
                      <span class="text-green-600 dark:text-green-400">{{ sub.lastUpdateStatus.message }}</span>
                      <span v-if="sub.lastUpdateStatus.latestTitle" class="text-muted-foreground"> · 最新：{{ sub.lastUpdateStatus.latestTitle }}</span>
                    </template>
                    <span v-else class="text-destructive">{{ sub.lastUpdateStatus.message }}</span>
                  </template>
                  <span v-else class="text-muted-foreground">—</span>
                </p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <span class="text-xs text-muted-foreground">{{ formatDate(sub.lastUpdated) }}</span>
                <div class="flex gap-1">
                  <Button variant="ghost" size="icon" class="size-8" @click="openEditForm(sub)">
                    <Icon name="lucide:pencil" class="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deleteSubscribe(sub.id)">
                    <Icon name="lucide:trash-2" class="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- 空状态 -->
        <div v-else-if="hasLoadedSubscribes" class="text-center py-16">
          <Icon name="lucide:rss" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
          <p class="text-muted-foreground">暂无订阅源</p>
          <Button variant="outline" class="mt-4" @click="showAddForm = true">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            添加第一个订阅
          </Button>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>
