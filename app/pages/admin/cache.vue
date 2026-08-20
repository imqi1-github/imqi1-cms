<script setup lang="ts">
import type { CsrfResponse } from "~/types/apis/admin/categories";
import type { ApiError } from "~/types/error";
import type { CacheClearBody, CacheClearResponse } from "~/types/apis/cache";

definePageMeta({
  title: "缓存管理",
});

const toast = useToast();
const csrfToken = ref("");

// 预设类别（label + 对应 SCAN 关键词）
const categories = [
  { label: "文章详情", keyword: "content", icon: "lucide:file-text", desc: "/content/**" },
  { label: "分类页", keyword: "category", icon: "lucide:folder", desc: "/category/**" },
  { label: "标签页", keyword: "tag", icon: "lucide:tag", desc: "/tag/**" },
  { label: "首页", keyword: "index", icon: "lucide:home", desc: "/" },
  { label: "归档", keyword: "archiving", icon: "lucide:archive", desc: "/archiving" },
  { label: "订阅", keyword: "subscribes", icon: "lucide:rss", desc: "/subscribes" },
  { label: "更新日志", keyword: "changelogs", icon: "lucide:scroll-text", desc: "/changelogs" },
  { label: "协议", keyword: "agreement", icon: "lucide:scale", desc: "/agreement" },
  { label: "站点地图", keyword: "sitemap", icon: "lucide:network", desc: "/sitemap" },
  { label: "关于", keyword: "about", icon: "lucide:info", desc: "/about" },
  { label: "旅行地图", keyword: "map", icon: "lucide:map", desc: "/map" },
  { label: "友链", keyword: "links", icon: "lucide:link", desc: "/links" },
  { label: "留言板", keyword: "messages", icon: "lucide:message-square", desc: "/messages" },
];

const clearingAll = ref(false);
const clearingPreset = ref<string | null>(null);
const clearingSearch = ref(false);
const clearingKeyword = ref(false);
const customKeyword = ref("");
const showAllDialog = ref(false);

async function fetchCsrf() {
  try {
    const res = await $fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" });
    if (res?.data?.token) {
      csrfToken.value = res.data.token;
    }
  } catch (error) {
    console.error("获取 CSRF token 失败", error);
  }
}

async function postClear(body: CacheClearBody, successMsg: string) {
  return $fetch<CacheClearResponse>("/api/admin/cache/clear", {
    method: "POST",
    body,
  }).then((res) => {
    if (!res.success) {
      toast.warning({ message: successMsg, description: res.message });
      return;
    }
    if (res.note) {
      toast.success({ message: successMsg, description: res.note });
    } else {
      toast.success({ message: successMsg, description: `共清理 ${res.cleared} 个缓存键` });
    }
  });
}

async function clearAll() {
  showAllDialog.value = false;
  clearingAll.value = true;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "all" }, "已清空全部缓存");
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    toast.error({ message: "清空失败", description: error?.data?.message || "请稍后重试" });
  } finally {
    clearingAll.value = false;
  }
}

async function clearPreset(keyword: string, label: string) {
  clearingPreset.value = keyword;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "preset", value: keyword }, `已清理${label}缓存`);
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    toast.error({ message: "清理失败", description: error?.data?.message || "请稍后重试" });
  } finally {
    clearingPreset.value = null;
  }
}

async function clearSearchCache() {
  clearingSearch.value = true;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "search" }, "已清除搜索缓存");
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    toast.error({ message: "清理失败", description: error?.data?.message || "请稍后重试" });
  } finally {
    clearingSearch.value = false;
  }
}

async function clearKeyword() {
  const keyword = customKeyword.value.trim();
  if (!keyword) {
    toast.warning({ message: "请输入关键词" });
    return;
  }
  clearingKeyword.value = true;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "keyword", value: keyword }, "已清理匹配缓存");
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    toast.error({ message: "清理失败", description: error?.data?.message || "请稍后重试" });
  } finally {
    clearingKeyword.value = false;
  }
}

onMounted(() => {
  fetchCsrf();
});
</script>

<template>
  <AdminLayout>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">缓存管理</h2>
        <p class="mt-1 text-sm text-muted-foreground">清理 Redis 中的页面 ISR 缓存与搜索缓存</p>
      </div>
    </div>

    <div class="space-y-6">
      <!-- 一键清空 -->
      <Card>
        <CardHeader>
          <CardTitle>一键清空</CardTitle>
          <CardDescription>清空整个 Redis 数据库（FLUSHDB），包含所有缓存类型</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <Icon name="lucide:alert-triangle" class="mt-0.5 size-5 shrink-0 text-destructive" />
            <div class="text-sm text-muted-foreground">
              此操作会清空<strong class="text-destructive">所有</strong> Redis 数据，包括页面缓存、搜索缓存、图标缓存等。图标与页面在访问后会自动重建，但操作不可撤销，请谨慎。
            </div>
          </div>
          <Button variant="destructive" :disabled="clearingAll" @click="showAllDialog = true">
            <Icon
              :name="clearingAll ? 'lucide:loader-2' : 'lucide:trash-2'"
              :class="{ 'animate-spin': clearingAll }"
              class="mr-2 size-4"
            />
            {{ clearingAll ? "清空中..." : "一键清空全部缓存" }}
          </Button>
        </CardContent>
      </Card>

      <!-- 搜索缓存：仅清自定义搜索结果缓存，不碰 Nuxt 页面缓存 -->
      <Card>
        <CardHeader>
          <CardTitle>搜索缓存</CardTitle>
          <CardDescription>清除自定义搜索结果缓存（search:* 前缀键），不影响 Nuxt /search 页面缓存</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-3">
            <Button variant="outline" :disabled="clearingSearch" @click="clearSearchCache">
              <Icon
                :name="clearingSearch ? 'lucide:loader-2' : 'lucide:eraser'"
                :class="{ 'animate-spin': clearingSearch }"
                class="mr-2 size-4"
              />
              {{ clearingSearch ? "清除中..." : "清除搜索缓存" }}
            </Button>
            <p class="text-sm text-muted-foreground">
              热门关键词的结果会缓存为 <code>search:&lt;关键词&gt;:&lt;类型&gt;</code>，数据有更新时可用此按钮清除。
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- 按类别清理 -->
      <Card>
        <CardHeader>
          <CardTitle>按类别清理</CardTitle>
          <CardDescription>只清理某一类前台页面的 ISR 缓存，不影响其他类别</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-3">
            <Button
              v-for="cat in categories"
              :key="cat.keyword"
              variant="outline"
              :disabled="clearingPreset !== null"
              :title="cat.desc"
              @click="clearPreset(cat.keyword, cat.label)"
            >
              <Icon
                v-if="clearingPreset === cat.keyword"
                name="lucide:loader-2"
                class="animate-spin"
              />
              <Icon v-else :name="cat.icon" />
              <span>{{ clearingPreset === cat.keyword ? "清理中" : cat.label }}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- 自定义关键词 -->
      <Card>
        <CardHeader>
          <CardTitle>自定义关键词</CardTitle>
          <CardDescription>按键名子串匹配删除（类似宝塔面板搜键），会删除所有键名包含该词的缓存</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex gap-3">
            <Input
              v-model="customKeyword"
              placeholder="例如 sitemap、content、about"
              @keyup.enter="clearKeyword"
            />
            <Button :disabled="clearingKeyword" @click="clearKeyword">
              <Icon
                :name="clearingKeyword ? 'lucide:loader-2' : 'lucide:search'"
                :class="{ 'animate-spin': clearingKeyword }"
                class="mr-2 size-4"
              />
              {{ clearingKeyword ? "清理中..." : "清理" }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 一键清空二次确认 -->
    <Dialog v-model:open="showAllDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认清空全部缓存</DialogTitle>
          <DialogDescription>
            将清空整个 Redis 数据库（FLUSHDB），所有页面与图标缓存都会被删除，访问后自动重建。此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showAllDialog = false">取消</Button>
          <Button variant="destructive" :disabled="clearingAll" @click="clearAll">
            <Icon
              :name="clearingAll ? 'lucide:loader-2' : 'lucide:trash-2'"
              :class="{ 'animate-spin': clearingAll }"
              class="mr-2 size-4"
            />
            确认清空
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
