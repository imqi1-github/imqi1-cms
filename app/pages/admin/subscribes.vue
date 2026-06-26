<script setup lang="ts">
const toast = useToast();
const subscribes = ref<any[]>([]);
const loading = ref(false);
const showAddForm = ref(false);
const showEditForm = ref(false);
const updating = ref(false);
const updateResult = ref<{ success: number; failed: number; total: number } | null>(null);
const feedCacheInterval = ref(8); // 默认8小时

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
    const settings = await ($fetch as any)("/api/admin/settings") as any;
    if (settings?.feedCacheInterval) {
      feedCacheInterval.value = settings.feedCacheInterval;
    }
  } catch (error) {
    console.error("获取设置失败:", error);
  }
}

// 加载订阅列表
async function loadSubscribes() {
  loading.value = true;
  try {
    subscribes.value = (await ($fetch as any)("/api/admin/subscribes")) as any[];
  } catch (error) {
    console.error("获取订阅失败:", error);
    subscribes.value = [];
  } finally {
    loading.value = false;
  }
}

async function addSubscribe() {
  try {
    await $fetch("/api/admin/subscribes", {
      method: "POST",
      body: newSubscribe.value,
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
  }
}

async function deleteSubscribe(id: number) {
  try {
    await $fetch(`/api/admin/subscribes/${id}`, { method: "DELETE" });
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

async function updateSubscribes() {
  updating.value = true;
  updateResult.value = null;
  try {
    const response = (await $fetch("/api/admin/subscribes/update", {
      method: "POST",
    })) as any;
    updateResult.value = response.data;
    toast.success({
      message: "更新完成",
      description: `成功 ${response.data.success}/${response.data.total} 个订阅源${response.data.failed > 0 ? `，失败 ${response.data.failed} 个` : ""}`,
    });
    await loadSubscribes();
  } catch (error) {
    console.error("更新失败:", error);
    toast.error({
      message: "更新失败",
    });
  } finally {
    updating.value = false;
    setTimeout(() => {
      updateResult.value = null;
    }, 5000);
  }
}

function cancelAdd() {
  newSubscribe.value = { name: "", url: "", avatar: "" };
  showAddForm.value = false;
}

function openEditForm(subscribe: any) {
  editingSubscribe.value = {
    id: subscribe.id,
    name: subscribe.name,
    url: subscribe.url,
    avatar: subscribe.avatar || "",
  };
  showEditForm.value = true;
}

async function updateSubscribe() {
  if (!editingSubscribe.value.id) return;

  try {
    await $fetch(`/api/admin/subscribes/${editingSubscribe.value.id}`, {
      method: "PUT",
      body: {
        name: editingSubscribe.value.name,
        url: editingSubscribe.value.url,
        avatar: editingSubscribe.value.avatar,
      },
    });
    showEditForm.value = false;
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
  }
}

function cancelEdit() {
  editingSubscribe.value = { id: null, name: "", url: "", avatar: "" };
  showEditForm.value = false;
}

function formatDate(date: string | null) {
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

onMounted(() => {
  loadSettings();
  loadSubscribes();
});
</script>

<template>
  <AdminLayout>
    <div class="mb-6">
      <h2 class="text-2xl font-bold">订阅列表</h2>
      <p class="text-sm text-muted-foreground mt-1">管理 RSS 订阅源，每{{ feedCacheInterval }}小时自动更新</p>
    </div>

    <!-- 更新结果提示 -->
    <Card v-if="updateResult" class="mb-6 border-primary/50 bg-primary/5">
      <CardContent class="p-4">
        <div class="flex items-center gap-2">
          <Icon name="lucide:check-circle" class="size-5 text-primary" />
          <span class="font-medium">更新完成</span>
          <span class="text-muted-foreground">
            成功 {{ updateResult.success }}/{{ updateResult.total }} 个订阅源
            <span v-if="updateResult.failed > 0">，失败 {{ updateResult.failed }} 个</span>
          </span>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>订阅源</CardTitle>
            <CardDescription>管理和配置 RSS 订阅源</CardDescription>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" :disabled="updating" @click="updateSubscribes">
              <Icon :name="updating ? 'lucide:loader-2' : 'lucide:refresh-cw'" :class="{ 'animate-spin': updating }" class="mr-2 size-4" />
              {{ updating ? "更新中..." : "手动更新" }}
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
          <form @submit.prevent="addSubscribe" class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input v-model="newSubscribe.name" placeholder="订阅名称" required />
            <Input v-model="newSubscribe.url" type="url" placeholder="RSS URL" required />
            <Input v-model="newSubscribe.avatar" type="url" placeholder="头像 URL（可选）" />
            <div class="flex gap-2">
              <Button type="submit">添加</Button>
              <Button type="button" variant="outline" @click="cancelAdd">取消</Button>
            </div>
          </form>
        </div>

        <!-- 编辑表单 -->
        <div v-if="showEditForm" class="mb-6 p-4 border rounded-lg bg-primary/5 border-primary/50">
          <h4 class="font-medium mb-4">编辑订阅</h4>
          <form @submit.prevent="updateSubscribe" class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input v-model="editingSubscribe.name" placeholder="订阅名称" required />
            <Input v-model="editingSubscribe.url" type="url" placeholder="RSS URL" required />
            <Input v-model="editingSubscribe.avatar" type="url" placeholder="头像 URL（可选）" />
            <div class="flex gap-2">
              <Button type="submit">保存</Button>
              <Button type="button" variant="outline" @click="cancelEdit">取消</Button>
            </div>
          </form>
        </div>

        <!-- 订阅列表 -->
        <!-- 加载状态 - 桌面端表格 -->
        <div v-if="loading" class="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>订阅源</TableHead>
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
                  <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                </TableCell>
                <TableCell class="text-right">
                  <div class="size-8 bg-muted rounded-lg animate-pulse ml-auto" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- 数据列表 - 桌面端表格 -->
        <Table v-else-if="subscribes.length > 0" class="hidden lg:table">
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>订阅源</TableHead>
              <TableHead>最后更新</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="sub in subscribes" :key="sub.id">
              <TableCell>
                <div class="flex items-center gap-3">
                  <Avatar class="size-8">
                    <AvatarImage v-if="sub.avatar" :src="sub.avatar" />
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
          </TableBody>
        </Table>

        <!-- 加载状态 - 移动端卡片 -->
        <div v-if="loading" class="lg:hidden space-y-4">
          <div v-for="i in 5" :key="i" class="flex items-center gap-4 p-4 border rounded-lg">
            <div class="size-12 bg-muted rounded-full animate-pulse" />
            <div class="flex-1 min-w-0">
              <div class="h-4 bg-muted rounded w-32 animate-pulse mb-2" />
              <div class="h-4 bg-muted rounded w-48 animate-pulse" />
            </div>
            <div class="h-4 bg-muted rounded w-24 animate-pulse" />
            <div class="size-8 bg-muted rounded-lg animate-pulse" />
          </div>
        </div>

        <!-- 数据列表 - 移动端卡片 -->
        <div v-else-if="subscribes.length > 0" class="lg:hidden space-y-4">
          <div v-for="sub in subscribes" :key="sub.id" class="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
            <Avatar class="size-12">
              <AvatarImage v-if="sub.avatar" :src="sub.avatar" />
              <AvatarFallback class="text-sm">{{ sub.name?.charAt(0) || "?" }}</AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-base">{{ sub.name }}</p>
              <a :href="sub.url" target="_blank" class="text-sm text-primary hover:underline truncate block">
                {{ sub.url }}
              </a>
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
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-16">
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
