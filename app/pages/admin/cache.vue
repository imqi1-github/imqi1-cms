<script setup lang="ts">
import type { CsrfResponse } from "~/types/apis/admin/categories";
import type { CacheClearBody, CacheClearResponse, CacheStatusResponse, CdnPurgeBody, CdnPurgeResponse } from "~/types/apis/cache";
import { CSRF_TOKEN_ENDPOINT } from "#shared/constants";

definePageMeta({
  title: "缓存管理",
});

const toast = useToast();
const csrfToken = ref("");

// 预设类别（label + 对应 SCAN 关键词 + 对应站内路由）
const categories = [
  { label: "文章详情", keyword: "content", icon: "lucide:file-text", desc: "/content/**", route: "/content/**" },
  { label: "分类页", keyword: "category", icon: "lucide:folder", desc: "/category/**", route: "/category/**" },
  { label: "标签页", keyword: "tag", icon: "lucide:tag", desc: "/tag/**", route: "/tag/**" },
  { label: "首页", keyword: "index", icon: "lucide:home", desc: "/", route: "/" },
  { label: "归档", keyword: "archiving", icon: "lucide:archive", desc: "/archiving", route: "/archiving" },
  { label: "订阅", keyword: "subscribes", icon: "lucide:rss", desc: "/subscribes", route: "/subscribes" },
  { label: "更新日志", keyword: "changelogs", icon: "lucide:scroll-text", desc: "/changelogs", route: "/changelogs" },
  { label: "协议", keyword: "agreement", icon: "lucide:scale", desc: "/agreement", route: "/agreement" },
  { label: "站点地图", keyword: "sitemap", icon: "lucide:network", desc: "/sitemap", route: "/sitemap" },
  { label: "关于", keyword: "about", icon: "lucide:info", desc: "/about", route: "/about" },
  { label: "旅行地图", keyword: "/map", icon: "lucide:map", desc: "/map", route: "/map" },
  { label: "友链", keyword: "links", icon: "lucide:link", desc: "/links", route: "/links" },
  { label: "留言板", keyword: "messages", icon: "lucide:message-square", desc: "/messages", route: "/messages" },
];

const clearingAll = ref(false);
const clearingPreset = ref<string | null>(null);
const clearingSearch = ref(false);
const clearingKeyword = ref(false);
const clearingFootprint = ref(false);
const customKeyword = ref("");
const showAllDialog = ref(false);

const purgingAll = ref(false);
const purgingRoute = ref<string | null>(null);
const purgingUrls = ref(false);
const purgingZone = ref(false);
const checkingStatus = ref(false);
const lastCdnJobId = ref("");
const customUrls = ref("");
const cacheStatus = ref<CacheStatusResponse | null>(null);

// 未拿到状态前按钮保持可用（避免误灰）；拿到后按配置灰显
const cdnReady = computed(() => !cacheStatus.value || cacheStatus.value.cdn.enabled);
const redisReady = computed(() => !cacheStatus.value || cacheStatus.value.redis.configured);

/** 拉取缓存能力状态（Redis 是否配置 / CDN 是否可用 / 今日剩余额度） */
async function fetchCacheStatus() {
  try {
    cacheStatus.value = await $fetch<CacheStatusResponse>("/api/admin/cache/status", { credentials: "include" });
  } catch {
    cacheStatus.value = null;
  }
}

/** 额度文案：剩余/每日 */
function quotaText(bucket: { daily: number; dailyAvailable: number } | null): string {
  if (!bucket) return "";
  return `${bucket.dailyAvailable} / ${bucket.daily}`;
}

async function fetchCsrf() {
  try {
    const res = await $fetch<CsrfResponse>(CSRF_TOKEN_ENDPOINT, { credentials: "include" });
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
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  showAllDialog.value = false;
  clearingAll.value = true;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "all" }, "已清空全部缓存");
  } catch (rawError: unknown) {
    toast.error({ message: "清空失败", error: rawError, description: "请稍后重试" });
  } finally {
    clearingAll.value = false;
  }
}

async function clearPreset(keyword: string, label: string, route: string) {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  clearingPreset.value = keyword;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "preset", value: keyword, route }, `已清理${label}缓存`);
  } catch (rawError: unknown) {
    toast.error({ message: "清理失败", error: rawError, description: "请稍后重试" });
  } finally {
    clearingPreset.value = null;
  }
}

async function clearSearchCache() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  clearingSearch.value = true;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "search" }, "已清除搜索缓存");
  } catch (rawError: unknown) {
    toast.error({ message: "清理失败", error: rawError, description: "请稍后重试" });
  } finally {
    clearingSearch.value = false;
  }
}

async function clearFootprint() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  clearingFootprint.value = true;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "footprint" }, "已清除足迹缓存");
  } catch (rawError: unknown) {
    toast.error({ message: "清理失败", error: rawError, description: "请稍后重试" });
  } finally {
    clearingFootprint.value = false;
  }
}

async function clearKeyword() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  const keyword = customKeyword.value.trim();
  if (!keyword) {
    toast.warning({ message: "请输入关键词" });
    return;
  }
  clearingKeyword.value = true;
  try {
    await postClear({ csrfToken: csrfToken.value, action: "keyword", value: keyword }, "已清理匹配缓存");
  } catch (rawError: unknown) {
    toast.error({ message: "清理失败", error: rawError, description: "请稍后重试" });
  } finally {
    clearingKeyword.value = false;
  }
}

onMounted(() => {
  fetchCsrf();
  fetchCacheStatus();
});

// ============ CDN 边缘缓存刷新 ============

async function postCdnPurge(body: Omit<CdnPurgeBody, "csrfToken">, successMsg: string) {
  return $fetch<CdnPurgeResponse>("/api/admin/cache/cdn-purge", {
    method: "POST",
    body: { ...body, csrfToken: csrfToken.value },
  }).then((res) => {
    if (!res.success) {
      toast.warning({ message: successMsg, description: res.message });
      return;
    }
    if (res.taskId) lastCdnJobId.value = res.taskId;
    toast.success({
      message: successMsg,
      description: `已提交 ${res.requested} 个刷新目标${res.taskId ? `，任务号 ${res.taskId}` : ""}`,
    });
  });
}

async function purgeAllPages() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  purgingAll.value = true;
  try {
    await postCdnPurge({ action: "all" }, "已提交全站页面刷新");
  } catch (rawError: unknown) {
    toast.error({ message: "刷新失败", error: rawError, description: "请稍后重试" });
  } finally {
    purgingAll.value = false;
  }
}

async function purgeRoute(route: string, label: string) {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  purgingRoute.value = route;
  try {
    await postCdnPurge({ action: "routes", routes: [route] }, `已提交${label}刷新`);
  } catch (rawError: unknown) {
    toast.error({ message: "刷新失败", error: rawError, description: "请稍后重试" });
  } finally {
    purgingRoute.value = null;
  }
}

async function purgeCustomUrls() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  const urls = customUrls.value
    .split(/[\n,\s]+/)
    .map(u => u.trim())
    .filter(Boolean);
  if (!urls.length) {
    toast.warning({ message: "请填写要刷新的 URL" });
    return;
  }
  purgingUrls.value = true;
  try {
    await postCdnPurge({ action: "urls", urls }, "已提交 URL 刷新");
    customUrls.value = "";
  } catch (rawError: unknown) {
    toast.error({ message: "刷新失败", error: rawError, description: "请稍后重试" });
  } finally {
    purgingUrls.value = false;
  }
}

async function purgeZone() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  purgingZone.value = true;
  try {
    await postCdnPurge({ action: "zone" }, "已提交整站刷新");
  } catch (rawError: unknown) {
    toast.error({ message: "刷新失败", error: rawError, description: "请稍后重试" });
  } finally {
    purgingZone.value = false;
  }
}

async function checkCdnStatus() {
  if (!csrfToken.value) {
    toast.error({ message: "会话已失效，请刷新页面后重试" });
    return;
  }
  checkingStatus.value = true;
  try {
    const res = await $fetch<CdnPurgeResponse>("/api/admin/cache/cdn-purge", {
      method: "POST",
      body: { csrfToken: csrfToken.value, action: "status", jobId: lastCdnJobId.value },
    });
    toast.info({
      message: `刷新任务 ${lastCdnJobId.value}`,
      description: `状态：${res.status ?? "未知"}${res.note ? `（${res.note}）` : ""}`,
    });
  } catch (rawError: unknown) {
    toast.error({ message: "查询失败", error: rawError, description: "请稍后重试" });
  } finally {
    checkingStatus.value = false;
  }
}
</script>

<template>
  <AdminLayout>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">缓存管理</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          两套互相独立的缓存：<strong>CDN 边缘缓存</strong>管页面 HTML，源站不可用时也能直接响应；
          <strong>源站缓存（Redis）</strong>管搜索、足迹与接口数据。谁没配好，就只影响谁那一组。
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <!-- ============ 分组一：CDN 边缘缓存 ============ -->
      <section class="space-y-3">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Icon name="lucide:globe" class="size-4" />
          CDN 边缘缓存
        </h3>
        <!-- CDN 边缘缓存：页面缓存的主战场 -->
        <Card :class="{ 'opacity-60': !cdnReady }">
          <CardHeader>
            <CardDescription>
              页面缓存由 CDN 边缘承担：改文章、评论、友链等内容后会自动刷新受影响页面，这里是手动兜底
              <span v-if="!cdnReady" class="ml-1 text-amber-600 dark:text-amber-400">
                （{{ cacheStatus?.cdn.disabledByEnv ? "开发环境不启用" : "未配置刷新：缺 ZoneId 或密钥" }}）
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 不可用原因 -->
            <div
              v-if="!cdnReady"
              class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground"
            >
              <Icon name="lucide:info" class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>
                <template v-if="cacheStatus?.cdn.disabledByEnv">
                  开发环境恒不启用 CDN 刷新，避免本地写库时误刷生产站；生产环境配好
                  <code>EDGEONE_ZONE_ID</code> / <code>EDGEONE_SECRET_ID</code> / <code>EDGEONE_SECRET_KEY</code> 后可用。
                </template>
                <template v-else>
                  未配置 CDN 刷新凭证（<code>EDGEONE_ZONE_ID</code> / <code>EDGEONE_SECRET_ID</code> /
                  <code>EDGEONE_SECRET_KEY</code>），以下按钮不可用。页面仍由边缘缓存，内容靠 TTL +
                  缓存预刷新自动更新；<strong>与 Redis 是否配置无关</strong>。
                </template>
              </p>
            </div>

            <!-- 今日剩余刷新额度：额度按天计，用尽后当天刷新全部失败 -->
            <div
              v-if="cacheStatus?.cdn.quota"
              class="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border bg-muted/40 px-4 py-3 text-sm"
            >
              <span class="text-muted-foreground">今日剩余刷新额度</span>
              <span>精确 URL：<code>{{ quotaText(cacheStatus.cdn.quota.url) }}</code></span>
              <span>目录：<code>{{ quotaText(cacheStatus.cdn.quota.prefix) }}</code></span>
              <span v-if="cacheStatus.cdn.quota.all">整站：<code>{{ quotaText(cacheStatus.cdn.quota.all) }}</code></span>
              <span v-if="cacheStatus.cdn.quotaExhausted" class="text-destructive">
                额度已耗尽，当天不再自动刷新，内容将在边缘缓存 TTL 到期后自动更新
              </span>
            </div>

            <div class="flex items-center justify-between gap-4">
              <div class="space-y-0.5">
                <p class="font-medium">全站页面</p>
                <p class="text-sm text-muted-foreground">刷新根目录下所有页面（首页 + 全部子页）</p>
              </div>
              <Button variant="outline" :disabled="!cdnReady || purgingAll" @click="purgeAllPages">
                <Icon
                  :name="purgingAll ? 'lucide:loader-2' : 'lucide:refresh-cw'"
                  :class="{ 'animate-spin': purgingAll }"
                  class="mr-2 size-4"
                />
                {{ purgingAll ? "提交中..." : "刷新" }}
              </Button>
            </div>

            <div class="space-y-2">
              <p class="font-medium">按类别刷新</p>
              <p class="text-sm text-muted-foreground">只刷新某一类前台页面</p>
              <div class="flex flex-wrap gap-2">
                <Button
                  v-for="cat in categories"
                  :key="`cdn-${cat.route}`"
                  variant="outline"
                  size="sm"
                  :disabled="!cdnReady || purgingRoute !== null"
                  :title="cat.desc"
                  @click="purgeRoute(cat.route, cat.label)"
                >
                  <Icon
                    v-if="purgingRoute === cat.route"
                    name="lucide:loader-2"
                    class="animate-spin"
                  />
                  <Icon v-else :name="cat.icon" />
                  <span>{{ purgingRoute === cat.route ? "提交中" : cat.label }}</span>
                </Button>
              </div>
            </div>

            <div class="flex flex-wrap items-end justify-between gap-4">
              <div class="min-w-64 flex-1 space-y-0.5">
                <p class="font-medium">指定 URL</p>
                <p class="text-sm text-muted-foreground">每行一个完整 URL（需带 https://）</p>
                <Input v-model="customUrls" class="mt-2" :disabled="!cdnReady" placeholder="https://imqi1.com/content/xxx" />
              </div>
              <Button variant="outline" :disabled="!cdnReady || purgingUrls" @click="purgeCustomUrls">
                <Icon
                  :name="purgingUrls ? 'lucide:loader-2' : 'lucide:eraser'"
                  :class="{ 'animate-spin': purgingUrls }"
                  class="mr-2 size-4"
                />
                {{ purgingUrls ? "提交中..." : "刷新" }}
              </Button>
            </div>

            <div v-if="lastCdnJobId" class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                最近一次刷新任务号：<code>{{ lastCdnJobId }}</code>（EdgeOne 异步执行，可查执行状态）
              </p>
              <Button variant="outline" size="sm" :disabled="!cdnReady || checkingStatus" @click="checkCdnStatus">
                <Icon
                  :name="checkingStatus ? 'lucide:loader-2' : 'lucide:circle-help'"
                  :class="{ 'animate-spin': checkingStatus }"
                  class="mr-2 size-4"
                />
                {{ checkingStatus ? "查询中..." : "查询状态" }}
              </Button>
            </div>

            <!-- 整站刷新：说明与按钮垂直居中对齐 -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <Icon name="lucide:alert-triangle" class="size-5 shrink-0 text-destructive" />
                <p class="text-sm text-muted-foreground">
                  整站刷新（purge_all）会清掉站点下所有缓存，CDN 配额消耗大（免费版每天仅 10 次），仅在必要时使用
                </p>
              </div>
              <Button variant="destructive" :disabled="!cdnReady || purgingZone" @click="purgeZone">
                <Icon
                  :name="purgingZone ? 'lucide:loader-2' : 'lucide:flame'"
                  :class="{ 'animate-spin': purgingZone }"
                  class="mr-2 size-4"
                />
                {{ purgingZone ? "提交中..." : "整站刷新" }}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <!-- ============ 分组二：源站缓存 ============ -->
      <section class="space-y-3">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Icon name="lucide:database" class="size-4" />
          源站缓存
        </h3>
        <!-- 未配置 Redis 时说明缓存落到哪：文件缓存 + 进程内内存，仍可手动清 -->
        <div
          v-if="!redisReady"
          class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground"
        >
          <Icon name="lucide:info" class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            未配置 Redis：页面缓存落在文件缓存（<code>.nitro/cache</code>），搜索/足迹等短期缓存落在进程内内存，
            下面的清理依然可用；<strong>CDN 边缘缓存请用上方「CDN 边缘缓存」分组刷新</strong>。
          </p>
        </div>

        <!-- 一键清空 -->
        <Card>
          <CardHeader>
            <CardTitle>一键清空</CardTitle>
            <CardDescription>
              清空整个 Redis 数据库（FLUSHDB）+ 源站页面缓存 + 进程内计数，并提交一次 CDN 边缘刷新
              <span v-if="!redisReady" class="ml-1 text-amber-600 dark:text-amber-400">（未配置 Redis：只清文件缓存与进程内缓存）</span>
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <Icon name="lucide:alert-triangle" class="size-5 shrink-0 text-destructive" />
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

        <!-- 自定义缓存（非 ISR）：前台接口自己写的缓存，由这里统一管理 -->
        <Card>
          <CardHeader>
            <CardTitle>自定义缓存（非 ISR）</CardTitle>
            <CardDescription>
              前台各接口自己写入、非 Nuxt 页面缓存的缓存：搜索关键词结果、足迹地理位置
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 搜索关键词结果缓存 -->
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-0.5">
                <p class="font-medium">搜索关键词结果</p>
                <p class="text-sm text-muted-foreground">
                  热门关键词的结果缓存为 <code>search:&lt;关键词&gt;:&lt;类型&gt;</code>，内容更新后清除
                </p>
              </div>
              <Button variant="outline" :disabled="clearingSearch" @click="clearSearchCache">
                <Icon
                  :name="clearingSearch ? 'lucide:loader-2' : 'lucide:eraser'"
                  :class="{ 'animate-spin': clearingSearch }"
                  class="mr-2 size-4"
                />
                {{ clearingSearch ? "清除中..." : "清除" }}
              </Button>
            </div>

            <!-- 足迹地理位置缓存 -->
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-0.5">
                <p class="font-medium">足迹地理位置</p>
                <p class="text-sm text-muted-foreground">
                  访客分布聚合（<code>custom:footprint</code>），访客分布更新后清除
                </p>
              </div>
              <Button variant="outline" :disabled="clearingFootprint" @click="clearFootprint">
                <Icon
                  :name="clearingFootprint ? 'lucide:loader-2' : 'lucide:map'"
                  :class="{ 'animate-spin': clearingFootprint }"
                  class="mr-2 size-4"
                />
                {{ clearingFootprint ? "清除中..." : "清除" }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- 按类别清理 -->
        <Card>
          <CardHeader>
            <CardTitle>按类别清理</CardTitle>
            <CardDescription>
              只清理某一类前台页面的源站缓存，不影响其他类别
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex flex-wrap gap-3">
              <Button
                v-for="cat in categories"
                :key="cat.keyword"
                variant="outline"
                :disabled="clearingPreset !== null"
                :title="cat.desc"
                @click="clearPreset(cat.keyword, cat.label, cat.route)"
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
            <CardDescription>
              按键名子串匹配删除（类似宝塔面板搜键），会删除所有键名包含该词的缓存
            </CardDescription>
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
      </section>
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
