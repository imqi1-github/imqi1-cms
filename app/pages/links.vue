<script setup lang="ts">
import "@/assets/css/fancybox.css";
import type {FancyboxOptions} from "@fancyapps/ui";
import {computed, onMounted, onUnmounted, ref, watch} from "vue";

import {zh_CN} from "@/assets/js/zh_CN.umd.js";
import {siteConfig} from "~~/site.config";
import type {LinkItem, LinkStatus, LinkFormMode} from "~/types/apis/links";
import type {CsrfTokenResponse} from "~/types/apis/csrf";
import type {ApiError} from "~/types/error";

// 导入前台通知 composable
const { success, error: showError, } = useFrontNotification();

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 是否显示友链地址输入框
const showLinkUrlInput = computed(() => siteSettings.value?.linkAutoApprove === true);

// 获取友链数据
const { data: linksData, pending, error } = await useFetch("/api/links", {
  headers: getInternalRequestHeaders(),
});
const links = computed(() => linksData.value?.data || []);

// 头像加载失败的友链 id 集合。不直接改 link.avatar（那是 useFetch 回来的不可变数据），改用本地状态触发字母回退。
const failedAvatarIds = ref<Set<number>>(new Set());
const markAvatarFailed = (id: number) => {
  failedAvatarIds.value = new Set(failedAvatarIds.value).add(id);
};

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth } = useAuth();

// 友链申请/修改为游客写接口，需 CSRF 双提交 token（POST body 内带上）
const csrfToken = ref("");

// 友链检测状态
const isCheckingLinks = ref(false);
const linkStatuses = ref<Record<string, LinkStatus>>({});
const lastCheckTime = ref<number>(0);
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24小时

// 检测中断控制
const shouldStopChecking = ref(false);
let abortController: AbortController | null = null;

// 从localStorage加载检测结果
const loadLinkStatuses = () => {
  if (import.meta.client) {
    try {
      const storedStatuses = localStorage.getItem("linkStatuses");
      if (storedStatuses) {
        linkStatuses.value = JSON.parse(storedStatuses);
      }
      const storedLastCheck = localStorage.getItem("lastLinkCheck");
      if (storedLastCheck) {
        lastCheckTime.value = parseInt(storedLastCheck, 10);
      }
    } catch (err) {
      console.error("加载友链状态失败:", err);
    }
  }
};

// 保存检测结果到localStorage
const saveLinkStatuses = () => {
  if (import.meta.client) {
    try {
      localStorage.setItem("linkStatuses", JSON.stringify(linkStatuses.value));
      localStorage.setItem("lastLinkCheck", lastCheckTime.value.toString());
    } catch (err) {
      console.error("保存友链状态失败:", err);
    }
  }
};

// 检测单个友链
const checkLink = async (link: LinkItem) => {
  if (!link.link || shouldStopChecking.value) return;

  linkStatuses.value[link.id] = {
    status: "checking",
    checkedAt: Date.now(),
  };

  try {
    // 创建新的 AbortController
    const controller = new AbortController();
    abortController = controller;
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(`/api/check-link?url=${encodeURIComponent(link.link)}`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 检查是否已中断
    if (shouldStopChecking.value) return;

    const result = await response.json();

    linkStatuses.value[link.id] = {
      status: result.status === "up" ? "up" : "down",
      checkedAt: Date.now(),
    };

    // 每检测完一个友链就立即保存
    saveLinkStatuses();
  } catch {
    // 如果是主动中断，不显示错误
    if (shouldStopChecking.value) return;

    linkStatuses.value[link.id] = {
      status: "down",
      checkedAt: Date.now(),
    };

    // 即使失败也保存状态
    saveLinkStatuses();
  }
};

// 批量检测友链
const checkAllLinks = async () => {
  if (isCheckingLinks.value) return;

  isCheckingLinks.value = true;
  shouldStopChecking.value = false;
  let hasCheckedAnyLink = false; // 标记是否真正检测了任何友链

  try {
    for (const link of links.value) {
      // 检查是否应该停止
      if (shouldStopChecking.value) {
        break;
      }

      // 检查是否已经检测过且未过期（1小时）
      const existingStatus = linkStatuses.value[link.id];
      const now = Date.now();
      const statusAge = existingStatus ? now - existingStatus.checkedAt : Infinity;

      // 如果检测结果还存在且未过期（1小时内），跳过检测
      if (existingStatus && existingStatus.status !== "checking" && statusAge < 60 * 60 * 1000) {
        continue;
      }

      hasCheckedAnyLink = true;
      await checkLink(link);

      // 检查是否应该停止（延迟后也要检查）
      if (shouldStopChecking.value) {
        break;
      }
      // 避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 无论正常完成还是中断，都更新最后检测时间
    lastCheckTime.value = Date.now();
    saveLinkStatuses();

    // 只有正常完成且真正检测了友链时，才显示提示
    if (!shouldStopChecking.value && hasCheckedAnyLink) {
      success("友链检测完成");
    }
  } catch {
    if (!shouldStopChecking.value) {
      showError("检测友链失败");
    }
  } finally {
    isCheckingLinks.value = false;
    abortController = null;
  }
};

// 检查是否需要自动检测
const checkIfNeedAutoCheck = () => {
  const now = Date.now();
  if (now - lastCheckTime.value >= CHECK_INTERVAL) {
    checkAllLinks();
  }
};

// 页面元数据
usePageSeo({
  title: computed(() => `友情链接 - ${siteName.value}`),
  description: siteConfig.pageSeo.links.description,
  keywords: siteConfig.pageSeo.links.keywords,
});

// 表单状态
const submitting = ref(false);
const showForceSubmit = ref(false); // 是否显示"仍然提交"按钮
// 表单模式：apply=申请, edit=修改
const formMode = ref<LinkFormMode>("apply");

// 修改友链：搜索和筛选
const linkSearchQuery = ref("");
const selectedFilterLetter = ref<string>("全部");

// 表单数据
const formData = ref({
  name: "",
  link: "",
  sort: "",
  avatar: "",
  blogLinkUrl: "", // 本站在对方博客的友链地址
});

// 过滤后的友链列表
const filteredLinks = computed(() => {
  let result = links.value;

  // 按首字母筛选
  if (selectedFilterLetter.value !== "全部") {
    result = result.filter(link =>
      link.name && link.name.charAt(0).toUpperCase() === selectedFilterLetter.value
    );
  }

  // 按搜索关键词筛选
  if (linkSearchQuery.value.trim()) {
    const query = linkSearchQuery.value.toLowerCase();
    result = result.filter(link =>
      link.name?.toLowerCase().includes(query) ||
      link.link?.toLowerCase().includes(query)
    );
  }

  return result;
});

// 获取友链首字母列表
const linkFirstLetters = computed(() => {
  const letters = new Set<string>();
  links.value.forEach(link => {
    if (link.name && link.name.charAt(0)) {
      letters.add(link.name.charAt(0).toUpperCase());
    }
  });
  return Array.from(letters).sort();
});

// 选中的友链
const selectedLink = ref<LinkItem | null>(null);

// 检查必填字段是否已填写
const isRequiredFieldsFilled = computed(() => {
  // CSRF token 未就绪前禁止提交（提交需要 token，否则被 403 拒）
  if (!csrfToken.value) return false;
  // 名称和链接始终为必填
  if (!formData.value.name?.trim()) return false;
  if (!formData.value.link?.trim()) return false;

  // 申请友链且开启自动审核时，本站友链地址也是必填
  if (formMode.value === 'apply' && showLinkUrlInput.value) {
    if (!formData.value.blogLinkUrl?.trim()) return false;
  }

  // 修改友链时必须已选中要修改的友链
  return !(formMode.value === 'edit' && !selectedLink.value);
});

// 选择友链
const selectLink = (link: LinkItem) => {
  selectedLink.value = link;
  formData.value.name = link.name || "";
  formData.value.link = link.link || "";
  formData.value.sort = link.desc || "";
  formData.value.avatar = link.avatar || "";
};

// 取消选择
const cancelSelection = () => {
  selectedLink.value = null;
  formData.value = {
    name: "",
    link: "",
    sort: "",
    avatar: "",
    blogLinkUrl: "",
  };
  linkSearchQuery.value = "";
  selectedFilterLetter.value = "全部";
};

// 监听模式切换，重置状态
watch(formMode, () => {
  cancelSelection();
});

// 处理链接显示
const formatUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
};

// 提交表单
const handleSubmit = async (forceSubmit = false) => {
  submitting.value = true;
  showForceSubmit.value = false;

  try {
    if (formMode.value === "apply") {
      // 申请友链
      const data = await $fetch("/api/links", {
        method: "POST",
        body: {
          name: formData.value.name,
          link: formData.value.link,
          desc: formData.value.sort,
          avatar: formData.value.avatar,
          blogLinkUrl: formData.value.blogLinkUrl,
          forceSubmit: forceSubmit, // 是否强制提交（跳过检测）
          csrfToken: csrfToken.value,
        },
      });

      if (data.code === 200) {
        success(data.message || "友链申请成功，请等待审核");
        // 重置表单
        cancelSelection();
      } else {
        // 如果检测失败且返回了 needRetry 标识，显示"仍然提交"按钮
        if ("needRetry" in data && data.needRetry) {
          showForceSubmit.value = true;
          showError(data.message || "链接检测失败，请检查是否正确添加本站友链");
        } else {
          showError(data.message || "申请失败，请重试");
        }
      }
    } else {
      // 修改友链
      if (!selectedLink.value) {
        showError("请先选择要修改的友链");
        submitting.value = false;
        return;
      }

      const data = await $fetch("/api/links/patch", {
        method: "POST",
        body: {
          originalLinkId: selectedLink.value.id,
          name: formData.value.name,
          link: formData.value.link,
          desc: formData.value.sort,
          avatar: formData.value.avatar,
          csrfToken: csrfToken.value,
        },
      });

      if (data.code === 200) {
        success("友链修改请求已提交，等待管理员审核");
        // 重置表单和选择
        cancelSelection();
      } else {
        showError(data.message || "提交失败，请重试");
      }
    }
  } catch (err) {
    // H3 抛出的 createError 会把 { statusCode, message } 放到 err.data，优先展示服务端的具体原因（如"链接格式不正确"）
    const message = (err as ApiError)?.data?.message || "网络错误，请稍后重试";
    showError(message);
  } finally {
    submitting.value = false;
  }
};

const fancyboxContainer = useTemplateRef<HTMLDivElement>("fancyboxContainer");
let FancyboxModule: typeof import("@fancyapps/ui") | null = null;

// 初始化 Fancybox 与友链检测
onMounted(async () => {
  // 预取 CSRF token（写接口 /api/links、/api/links/patch 需在 body 带上）。
  // 用 await 而非 fire-and-forget：token 未回填前点击提交会带空 csrfToken 被 403 拒，让访客误以为出错。
  try {
    const csrfRes = await $fetch<CsrfTokenResponse>("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) csrfToken.value = csrfRes.data.token;
  } catch {
    // 预取失败不阻断初始化，提交时 isRequiredFieldsFilled（含 token 判断）会拦住空 token
  }
  // 动态导入 Fancybox（仅客户端）
  FancyboxModule = await import("@fancyapps/ui");
  // 加载友链状态
  loadLinkStatuses();
  // 检查是否需要自动检测
  checkIfNeedAutoCheck();

  FancyboxModule.Fancybox.bind(fancyboxContainer.value, "[data-fancybox]", {
    // === 全局选项 ===
    l10n: zh_CN,
    placeFocusBack: false,
    Hash: false,
    trapFocus: false,
    closeExisting: false, // === v6改动：缩略图缩放动画 ===
    zoomEffect: true, // 对应 v5 的 Images.zoom: true :contentReference[oaicite:0]{index=0}

    // === Carousel 插件配置替代 v5 结构 ===
    Carousel: {
      // Images.zoom 和 Panzoom.maxScale
      Panzoom: {
        maxScale: 2,
      }, // 工具栏结构
      Toolbar: {
        display: {
          left: ["infobar"],
          middle: ["zoomIn", "zoomOut", "toggle1to1", "rotateCCW", "rotateCW", "flipX", "flipY"],
          right: ["thumbs", "close"],
        },
      }, // 关闭缩放缩略图中的自动播放、Hash 等
      Autoplay: false,
    },

    // === 其他 UI 行为 ===
    idle: false,
    autoFocus: false,
    tpl: {
      main: `<div class="fancybox__container" role="dialog" tabindex="-1">
  <div class="fancybox__backdrop"></div>
  <div class="fancybox__carousel"></div>
  <div class="fancybox__footer"></div>
</div>`,
    },
  } as Partial<FancyboxOptions>);
});

onUnmounted(() => {
  // 停止友链检测
  shouldStopChecking.value = true;
  isCheckingLinks.value = false;

  // 取消正在进行的请求
  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  // 清理 Fancybox
  // Fancybox.destroy();
  if (FancyboxModule) {
    FancyboxModule.Fancybox.unbind(fancyboxContainer.value);
  }
});
</script>

<template>
  <div class="max-w-225 mx-auto">
    <!-- 标题区域 -->
    <header ref="fancyboxContainer" v-scroll-reveal>
      <!-- 封面图片 -->
      <img
        data-fancybox="gallery"
        data-caption="封面"
        :src="publicAsset('/imgs/links-cover.png')"
        alt="封面"
        loading="lazy"
        class="w-full aspect-video max-h-37.5 object-cover border border-gray-200 dark:border-gray-700 mb-2.5 cursor-zoom-in bg-gray-100 dark:bg-gray-800" >

      <!-- 标题 -->
      <h1 class="text-[3em] font-extrabold mb-2.5">友链</h1>

      <!-- 描述 -->
      <div class="mb-4">
        <div class="text-[0.8em] text-slate-600 dark:text-slate-400">海内存知已，天涯若比邻。</div>
        <!-- 编辑按钮（仅登录时显示） -->
        <ClientOnly>
          <a
            v-if="isLoggedIn && !isLoadingAuth"
            href="/admin/links"
            target="_blank"
            class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 mr-4">
            <Icon mode="svg" name="lucide:edit" class="size-3" />
            编辑友链
          </a>
        </ClientOnly>
          <NuxtLink
            href="/subscribes"
            class="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
            <Icon mode="svg" name="ri:rss-line" class="size-3" />
            也可以看看我的订阅列表
          </NuxtLink>
      </div>
    </header>

    <!-- 友链列表区域 -->
    <section v-scroll-reveal class="my-8">
      <h2 class="sr-only">友链列表</h2>
      <div class="flex justify-between sm:items-center mb-4 max-sm:flex-col gap-3">
        <blockquote
          class="border-l-4 border-blue-600 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-[0.95em] px-4 py-3 rounded-sm">
          友链顺序不分先后，每一个都值得一看。
        </blockquote>
        <button
          :disabled="isCheckingLinks"
          class="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm flex items-center gap-1.5 w-fit cursor-pointer"
          @click="checkAllLinks">
          <Icon name="lucide:refresh-cw" class="size-4" />
          <span v-if="isCheckingLinks">检测中...</span>
          <span v-else>检测友链</span>
        </button>
      </div>

      <!-- 加载状态 -->
      <div v-if="pending" class="py-10 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"/>
        <p class="mt-2 text-slate-500">加载中...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="py-10 text-center">
        <Icon name="lucide:alert-circle" class="size-8 text-red-500 mx-auto mb-2" />
        <p class="text-red-500">加载友链失败，请刷新重试</p>
      </div>

      <!-- 空状态 -->
      <div v-else-if="links.length === 0" class="py-10 text-center">
        <Icon name="lucide:link" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <p class="text-slate-500">暂无友情链接</p>
      </div>

      <!-- 友链网格 -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
        <a
          v-for="link in links"
          :key="link.id"
          :href="link.link"
          target="_blank"
          rel="noopener"
          :aria-label="`访问友链：${link.name}${link.desc ? ' - ' + link.desc : ''}`"
          class="group relative flex flex-col bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-gray-700/60 rounded-2xl no-underline overflow-hidden transition-all duration-300 ease-out hover:border-blue-600">
          <!-- 状态点（检测中带呼吸光环） -->
          <span
            v-if="linkStatuses[link.id]"
            class="absolute top-3 right-3 z-10 flex items-center justify-center size-2"
            :title="linkStatuses[link.id]?.status === 'up' ? '可访问' : linkStatuses[link.id]?.status === 'down' ? '不可访问' : '检测中'">
            <span
              v-if="linkStatuses[link.id]?.status === 'checking'"
              aria-hidden="true"
              class="absolute inline-flex size-2 rounded-full bg-blue-500 opacity-60 animate-ping"/>
            <span
              class="relative size-2 rounded-full"
              :class="{
                'bg-green-500': linkStatuses[link.id]?.status === 'up',
                'bg-red-500': linkStatuses[link.id]?.status === 'down',
                'bg-blue-500': linkStatuses[link.id]?.status === 'checking',
              }"/>
          </span>

          <!-- 头部：头像 + 名称/描述 -->
          <div class="flex items-center gap-4 p-5 pb-3">
            <!-- 头像 -->
            <div class="size-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-xl text-slate-500 dark:text-slate-300 shrink-0 overflow-hidden">
              <template v-if="link.avatar && !failedAvatarIds.has(link.id)">
                <img
                  :src="link.avatar"
                  :alt="link.name"
                  class="no-img-loading w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                  loading="lazy"
                  @error="markAvatarFailed(link.id)" >
              </template>
              <template v-else>
                {{ link.name.charAt(0).toUpperCase() }}
              </template>
            </div>
            <!-- 名称 + 描述 -->
            <div class="flex-1 min-w-0">
              <h3 class="text-[1em] font-semibold text-gray-900 dark:text-gray-100 truncate transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400">
                {{ link.name }}
              </h3>
              <p v-if="link.desc" class="mt-1 text-[0.8em] text-slate-500 dark:text-slate-400 line-clamp-2">
                {{ link.desc }}
              </p>
            </div>
          </div>

          <!-- 底部域名条 -->
          <div class="flex items-center justify-between gap-2 px-5 py-2.5 mt-auto border-t border-gray-100 dark:border-gray-700/60">
            <div class="flex items-center gap-1.5 min-w-0 text-[0.8em] text-slate-500 dark:text-slate-400 transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400">
              <Icon name="ri:global-line" aria-hidden="true" class="size-3.5 shrink-0" />
              <span class="truncate">{{ formatUrl(link.link) }}</span>
            </div>
            <span v-if="linkStatuses[link.id]" class="text-[0.7em] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
              {{ new Date(linkStatuses[link.id]?.checkedAt ?? 0).toLocaleTimeString() }}
            </span>
          </div>
        </a>
      </div>
      <MapEntryLinks :views="['blogs']" title="看看这些站点位于哪里" class="mt-6" />
    </section>

    <!-- 本站加入的博客组织 -->
    <section v-scroll-reveal class="my-8">
      <h2 class="text-xl font-bold mb-4">本站已加入的博客组织</h2>
      <div class="flex flex-wrap gap-4">
        <a
          v-for="org in siteConfig.links.blogOrganizations"
          :key="org.name"
          :href="org.url"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-600 transition-all duration-300 group">
          <img
            :src="publicAsset(org.icon)"
            :alt="org.name"
            class="w-6 h-6 object-contain rounded-full"
            loading="lazy" >
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 transition-colors">{{ org.name }}</span>
        </a>
      </div>
    </section>

    <!-- 本站信息卡片 -->
    <section v-scroll-reveal class="my-8">
      <h2 class="text-xl font-bold mb-4">本站信息</h2>
      <div class="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-slate-800/50 dark:to-slate-900/50 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div class="flex flex-col md:flex-row gap-6">
          <!-- 头像 -->
          <div class="shrink-0">
            <img
              :src="siteConfig.links.profile.siteAvatar"
              :alt="siteConfig.links.profile.siteName"
              class="w-20 h-20 rounded-xl object-cover cursor-context-menu" >
          </div>
          <!-- 信息 -->
          <div class="flex-1 space-y-1">
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">{{ siteConfig.links.profile.siteName }}</h3>
              <p class="text-slate-600 dark:text-slate-400 text-sm mt-1">{{ siteConfig.links.profile.siteDescription }}</p>
            </div>
            <div class="flex flex-wrap gap-4 text-sm">
              <div class="flex items-center gap-2">
                <Icon name="ri:link" class="text-blue-600" />
                <a :href="siteConfig.links.profile.siteUrl" target="_blank" rel="noopener" class="text-blue-600 hover:underline">
                  {{ siteConfig.links.profile.siteUrl }}
                </a>
              </div>
            </div>
            <div class="text-slate-400 dark:text-slate-500 text-xs mt-3">
              * 名称二选一，头像右击后复制链接
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 友链申请说明 -->
    <section v-scroll-reveal class="mt-12">
      <h2 class="text-xl font-bold mb-4">{{ formMode === "apply" ? "申请友链" : "修改友链" }}</h2>

      <!-- 模式切换单选按钮 -->
      <div class="flex items-center gap-6 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="formMode"
            type="radio"
            value="apply"
            class="w-4 h-4 text-blue-600 cursor-pointer" >
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">申请友链</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="formMode"
            type="radio"
            value="edit"
            class="w-4 h-4 text-blue-600 cursor-pointer" >
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">修改友链</span>
        </label>
      </div>

      <!-- 申请模式说明 -->
      <div
        v-if="formMode === 'apply'"
        :class="[
          'rounded-lg p-4 text-[0.95em] mb-6',
          showLinkUrlInput
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
            : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
        ]">
        <p class="mb-2 flex items-center gap-0.5">
          <Icon :name="showLinkUrlInput ? 'lucide:info' : 'lucide:alert-triangle'" class="size-4 inline mr-1" />
          <strong>{{ showLinkUrlInput ? '提示：' : '注意：' }}</strong>
        </p>

        <!-- 自动友链模式说明 -->
        <p v-if="showLinkUrlInput">
          站长已开启友链自动添加功能，申请前请确保你已在贵站添加本站为友链，并在“能看到友情链接的地址”处正确填写贵站友情链接页面URL。若申请后后台检测到贵站已添加友链会自动通过，若未识别成功请检查贵站友情链接，或点击“仍然提交”。
        </p>

        <!-- 普通模式说明 -->
        <p v-else>
          本站只加熟悉的朋友的、频繁来本站评论的朋友的链接，不接受直接的友链申请，即使你申请了我也不会通过。详细规则请前往
          <NuxtLink to="/agreement#友链" target="_blank" class="text-blue-600 hover:underline">协议页面</NuxtLink>
          查看。
        </p>
      </div>

      <!-- 修改模式说明 -->
      <div
        v-else
        class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-blue-800 dark:text-blue-200 text-[0.95em] mb-6">
        <p class="mb-2 flex items-center gap-0.5">
          <Icon name="lucide:info" class="size-4 inline mr-1" />
          <strong>修改友链说明：</strong>
        </p>
        <p class="mb-2">修改友链为敏感操作，需确保原站符合以下三种情况之一：</p>
        <ul class="list-disc list-inside space-y-1 ml-2 mb-2">
          <li>原站发布了换站公告；</li>
          <li>原站重定向到新站；</li>
          <li>原站无法访问。</li>
        </ul>
        <p>请在下方选择你的原站，然后填写修改后的信息。</p>
      </div>

      <!-- 申请表单 -->
      <form class="space-y-4" @submit.prevent="() => handleSubmit()">
        <!-- 修改模式：选择要修改的友链 -->
        <div v-if="formMode === 'edit'" class="mb-4">
          <!-- 已选择友链时显示 -->
          <div v-if="selectedLink" class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-semibold text-lg shrink-0 overflow-hidden">
                  <template v-if="selectedLink.avatar">
                    <img :src="selectedLink.avatar" :alt="selectedLink.name" class="w-full h-full object-cover" >
                  </template>
                  <template v-else>
                    {{ selectedLink.name?.charAt(0).toUpperCase() }}
                  </template>
                </div>
                <div>
                  <div class="font-semibold text-gray-900 dark:text-gray-100">{{ selectedLink.name }}</div>
                  <div class="text-sm text-slate-600 dark:text-slate-400">{{ formatUrl(selectedLink.link) }}</div>
                </div>
              </div>
              <button
                type="button"
                class="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                @click="cancelSelection">
                重新选择
              </button>
            </div>
          </div>

          <!-- 未选择时显示搜索和筛选 -->
          <div v-else>
            <!-- 搜索框 -->
            <div class="mb-3">
              <FloatingInput
                id="link-search"
                v-model="linkSearchQuery"
                icon="lucide:search"
                label="搜索友链名称或链接..." />
            </div>

            <!-- 首字母筛选 -->
            <div class="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                :class="[
                  'px-3 py-1 text-sm rounded transition-colors cursor-pointer',
                  selectedFilterLetter === '全部'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-gray-900 dark:text-gray-100 hover:bg-slate-300 dark:hover:bg-slate-600'
                ]"
                @click="selectedFilterLetter = '全部'">
                全部
              </button>
              <button
                v-for="letter in linkFirstLetters"
                :key="letter"
                type="button"
                :class="[
                  'px-3 py-1 text-sm rounded transition-colors cursor-pointer',
                  selectedFilterLetter === letter
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-gray-900 dark:text-gray-100 hover:bg-slate-300 dark:hover:bg-slate-600'
                ]"
                @click="selectedFilterLetter = letter">
                {{ letter }}
              </button>
            </div>

            <!-- 友链列表 -->
            <div class="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
              <div
                v-for="link in filteredLinks"
                :key="link.id"
                class="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                @click="selectLink(link)">
                <div class="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-semibold shrink-0 overflow-hidden">
                  <template v-if="link.avatar">
                    <img :src="link.avatar" :alt="link.name" class="w-full h-full object-cover" >
                  </template>
                  <template v-else>
                    {{ link.name?.charAt(0).toUpperCase() }}
                  </template>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ link.name }}</div>
                  <div class="text-sm text-slate-600 dark:text-slate-400 truncate">{{ formatUrl(link.link) }}</div>
                </div>
              </div>

              <!-- 空状态 -->
              <div v-if="filteredLinks.length === 0" class="p-6 text-center text-slate-500 dark:text-slate-400">
                <Icon name="lucide:search" class="size-8 mx-auto mb-2 opacity-50" />
                <p>未找到匹配的友链</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入框（申请模式或已选择友链时显示） -->
        <!-- :key="formMode"：申请/修改切换时整组重建，避免内容被清空后浮动标签出现"落回中央"的过渡动画 -->
        <div v-if="formMode === 'apply' || selectedLink" :key="formMode" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="link-name"
              v-model="formData.name"
              icon="lucide:user"
              :label="formMode === 'edit' ? '新名称 *' : '名称 *'" />
            <FloatingInput
              id="link-url"
              v-model="formData.link"
              icon="lucide:link"
              :label="formMode === 'edit' ? '新链接 *' : '链接 *'" />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="link-sort"
              v-model="formData.sort"
              icon="lucide:tag"
              label="描述 / 简介" />
            <FloatingInput
              id="link-avatar"
              v-model="formData.avatar"
              icon="lucide:image"
              label="头像" />
          </div>

          <!-- 友链地址输入框（仅当后台开启时显示，且仅在申请模式下） -->
          <FloatingInput
            v-if="showLinkUrlInput && formMode === 'apply'"
            id="blog-link-url"
            v-model="formData.blogLinkUrl"
            icon="lucide:external-link"
            label="能看到友情链接的地址 *" />
        </div>

        <button
          type="submit"
          :disabled="submitting || !isRequiredFieldsFilled"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
          <span v-if="submitting">{{ formMode === "apply" ? "提交中..." : "修改中..." }}</span>
          <span v-else-if="formMode === 'edit' && !selectedLink">请先选择要修改的链接</span>
          <span v-else>{{ formMode === "apply" ? (showForceSubmit ? "重试" : "申请友链") : "提交修改" }}</span>
        </button>

        <!-- 仍然提交按钮（当检测失败时显示） -->
        <button
          v-if="showForceSubmit && formMode === 'apply' && !submitting"
          type="button"
          class="ml-2 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          @click="() => handleSubmit(true)">
          仍然提交
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}
</style>
