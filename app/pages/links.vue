<script setup lang="ts">
import "@/assets/css/fancybox.css";
import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import { Fancybox } from "@fancyapps/ui";
import { computed, onMounted, ref } from "vue";

// 导入前台通知 composable
const { success, error: showError } = useFrontNotification();

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");

// 获取友链数据
const { data: linksData, pending, error, refresh } = await useFetch("/api/links");
const links = computed(() => linksData.value?.data || []);

// 用户登录状态
const isLoggedIn = ref(false);
const isLoadingAuth = ref(true);

// 友链检测状态
const isCheckingLinks = ref(false);
const linkStatuses = ref<Record<string, { status: "up" | "down" | "checking"; checkedAt: number }>>({});
const lastCheckTime = ref<number>(0);
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24小时

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
const checkLink = async (link: any) => {
  if (!link.link) return;

  linkStatuses.value[link.id] = {
    status: "checking",
    checkedAt: Date.now(),
  };

  try {
    const response = await fetch(`/api/check-link?url=${encodeURIComponent(link.link)}`, {
      method: "GET",
      timeout: 10000, // 10秒超时
    });

    const result = await response.json();

    linkStatuses.value[link.id] = {
      status: result.status === "up" ? "up" : "down",
      checkedAt: Date.now(),
    };
  } catch (err) {
    linkStatuses.value[link.id] = {
      status: "down",
      checkedAt: Date.now(),
    };
  }
};

// 批量检测友链
const checkAllLinks = async () => {
  if (isCheckingLinks.value) return;

  isCheckingLinks.value = true;

  try {
    for (const link of links.value) {
      await checkLink(link);
      // 避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    lastCheckTime.value = Date.now();
    saveLinkStatuses();
    success("友链检测完成");
  } catch (err) {
    showError("检测友链失败");
  } finally {
    isCheckingLinks.value = false;
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
useHead({
  title: computed(() => `友情链接 - ${siteName.value}`),
  meta: [
    {
      name: "description",
      content: "查看 ImQi1 的友情链接，发现更多优秀的博客和网站。欢迎申请友链交换。",
    },
    {
      name: "keywords",
      content: "友情链接,友链,博客链接,网站推荐,链接交换",
    },
    {
      property: "og:title",
      content: computed(() => `友情链接 - ${siteName.value}`),
    },
    {
      property: "og:description",
      content: "查看 ImQi1 的友情链接，发现更多优秀的博客和网站。欢迎申请友链交换。",
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      name: "twitter:title",
      content: computed(() => `友情链接 - ${siteName.value}`),
    },
    {
      name: "twitter:description",
      content: "查看 ImQi1 的友情链接，发现更多优秀的博客和网站。欢迎申请友链交换。",
    },
  ],
});

// 表单状态
const submitting = ref(false);
const submitSuccess = ref(false);
const submitError = ref("");

// 表单数据
const formData = ref({
  name: "",
  link: "",
  sort: "",
  avatar: "",
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
const handleSubmit = async () => {
  // 重置状态
  submitSuccess.value = false;
  submitError.value = "";
  submitting.value = true;

  try {
    const response = await fetch("/api/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData.value),
    });

    const data = await response.json();

    if (data.code === 200) {
      submitSuccess.value = true;
      // 显示前台通知
      success("友链申请成功，请等待审核");
      // 重置表单
      formData.value = {
        name: "",
        link: "",
        sort: "",
        avatar: "",
      };
    } else {
      submitError.value = data.message || "申请失败，请重试";
      // 显示前台错误通知
      showError(data.message || "申请失败，请重试");
    }
  } catch (error) {
    submitError.value = "网络错误，请稍后重试";
    // 显示前台错误通知
    showError("网络错误，请稍后重试");
  } finally {
    submitting.value = false;
  }
};

// 检查用户登录状态
const checkAuthStatus = async () => {
  if (import.meta.client) {
    try {
      const res = await $fetch("/api/auth/verify");
      isLoggedIn.value = (res as any).valid || false;
    } catch {
      isLoggedIn.value = false;
    } finally {
      isLoadingAuth.value = false;
    }
  }
};

// 初始化滚动渐入动画
onMounted(() => {
  // 检查登录状态
  checkAuthStatus();
  // 加载友链状态
  loadLinkStatuses();
  // 检查是否需要自动检测
  checkIfNeedAutoCheck();

  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const fadeInObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-start");
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // 观察所有需要滚动渐入的元素
  document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach(el => {
    fadeInObserver.observe(el);
  });

  Fancybox.bind("[data-fancybox]", {
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
  });
});

onUnmounted(() => {
  Fancybox.destroy();
});
</script>

<template>
  <div class="max-w-225 mx-auto">
    <!-- 标题区域 -->
    <header class="animate-fade-in">
      <!-- 封面图片 -->
      <img
        data-fancybox="gallery"
        data-caption="封面"
        src="/imgs/links-cover.png"
        alt="封面"
        loading="lazy"
        class="w-full aspect-video max-h-37.5 object-cover border border-gray-200 dark:border-gray-700 mb-2.5 cursor-zoom-in bg-gray-100 dark:bg-gray-800" />

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
            class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
            <Icon name="lucide:edit" class="size-3" />
            编辑友链
          </a>
        </ClientOnly>
      </div>
    </header>

    <!-- 友链列表区域 -->
    <section class="my-8 animate-fade-in">
      <h2 class="sr-only">友链列表</h2>
      <div class="flex justify-between sm:items-center mb-4 max-sm:flex-col gap-3">
        <blockquote
          class="border-l-4 border-blue-600 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-[0.95em] px-4 py-3 rounded-sm">
          友链顺序不分先后，每一个都值得一看。
        </blockquote>
        <button
          @click="checkAllLinks"
          :disabled="isCheckingLinks"
          class="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm flex items-center gap-1.5 w-fit">
          <Icon name="lucide:refresh-cw" class="size-4" />
          <span v-if="isCheckingLinks">检测中...</span>
          <span v-else>检测友链</span>
        </button>
      </div>

      <!-- 加载状态 -->
      <div v-if="pending" class="py-10 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
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
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
        <a
          v-for="link in links"
          :key="link.id"
          :href="link.link"
          target="_blank"
          rel="noopener"
          class="group relative flex flex-col bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-5 no-underline overflow-hidden transition-all duration-300 ease-out hover:border-blue-600 hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:-translate-y-0.5">
          <!-- 状态图标 -->
          <div v-if="linkStatuses[link.id]" class="absolute top-3 right-3 flex-shrink-0 z-10">
            <Icon v-if="linkStatuses[link.id].status === 'up'" name="lucide:check-circle-2" class="size-4 text-green-500" title="可访问" />
            <Icon v-else-if="linkStatuses[link.id].status === 'down'" name="lucide:x-circle" class="size-4 text-red-500" title="不可访问" />
            <Icon v-else name="lucide:loader-2" class="size-4 text-blue-500 animate-spin" title="检测中" />
          </div>

          <!-- 卡片头部 -->
          <div class="flex items-center gap-4 mb-4">
            <!-- 头像 -->
            <div
              class="w-14 h-14 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-semibold text-xl shrink-0 overflow-hidden">
              <template v-if="link.avatar">
                <img
                  :src="link.avatar"
                  :alt="link.name"
                  class="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                  loading="lazy"
                  @error="link.avatar = ''" />
              </template>
              <template v-else>
                {{ link.name.charAt(0).toUpperCase() }}
              </template>
            </div>
            <!-- 信息 -->
            <div class="flex-1 min-w-0">
              <div class="text-[1.05em] font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                {{ link.name }}
              </div>
              <div
                v-if="link.desc"
                class="text-slate-600 dark:text-slate-400 text-[0.75em]">
                {{ link.desc }}
              </div>
            </div>
          </div>

          <!-- URL -->
          <div
            class="flex items-center justify-between gap-1.5 text-[0.85em] text-slate-500 dark:text-slate-400 border-t border-gray-200 dark:border-gray-700 pt-3 mt-auto group-hover:text-blue-600">
            <div class="flex items-center gap-1.5">
              <Icon name="ri:link" class="text-base opacity-60 transition-opacity duration-300 group-hover:opacity-100" />
              <span class="truncate">{{ formatUrl(link.link) }}</span>
            </div>
            <!-- 检测时间 -->
            <span v-if="linkStatuses[link.id]" class="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {{ new Date(linkStatuses[link.id].checkedAt).toLocaleTimeString() }}
            </span>
          </div>
        </a>
      </div>
    </section>

    <!-- 本站信息卡片 -->
    <section class="my-8 animate-fade-in">
      <h2 class="text-xl font-bold mb-4">本站信息</h2>
      <div class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800/50 dark:to-slate-900/50 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div class="flex flex-col md:flex-row gap-6">
          <!-- 头像 -->
          <div class="shrink-0">
            <img
              src="https://cn.cravatar.com/avatar/2841d29eeabab633ae116c7b2c97e3bf?size=512"
              alt="ImQi1"
              class="w-20 h-20 rounded-xl object-cover" />
          </div>
          <!-- 信息 -->
          <div class="flex-1 space-y-3">
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">ImQi1 / 棋</h3>
              <p class="text-slate-600 dark:text-slate-400 text-sm mt-1">做技术的分享者 · 生活的摄影师 · 时事的评论员</p>
            </div>
            <div class="flex flex-wrap gap-4 text-sm">
              <div class="flex items-center gap-2">
                <Icon name="ri:link" class="text-blue-600" />
                <a href="https://imqi1.com" target="_blank" rel="noopener" class="text-blue-600 hover:underline">
                  https://imqi1.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 友链申请说明 -->
    <section class="mt-12 animate-fade-in">
      <h2 class="text-xl font-bold mb-4">申请友链</h2>

      <div
        class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-800 dark:text-amber-200 text-[0.95em] mb-6">
        <p class="mb-2">
          <Icon name="lucide:alert-triangle" class="size-4 inline mr-1" />
          <strong>注意：</strong>
        </p>
        <p>
          本站只加熟悉的朋友的、频繁来本站评论的朋友的链接，不接受直接的友链申请，即使你申请了我也不会通过。详细规则请前往
          <NuxtLink to="/agreement#友链" target="_blank" class="text-blue-600 hover:underline">协议页面</NuxtLink>
          查看。
        </p>
      </div>

      <!-- 申请表单 -->
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="link-name" class="sr-only">名称</label>
            <input
              id="link-name"
              v-model="formData.name"
              type="text"
              placeholder="名称 *"
              class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:border-blue-600 transition-colors" />
          </div>
          <div>
            <label for="link-url" class="sr-only">链接</label>
            <input
              id="link-url"
              v-model="formData.link"
              type="text"
              placeholder="链接 *"
              class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:border-blue-600 transition-colors" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="link-sort" class="sr-only">分类</label>
            <input
              id="link-sort"
              v-model="formData.sort"
              type="text"
              placeholder="分类"
              class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:border-blue-600 transition-colors" />
          </div>
          <div>
            <label for="link-avatar" class="sr-only">头像</label>
            <input
              id="link-avatar"
              v-model="formData.avatar"
              type="text"
              placeholder="头像"
              class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:border-blue-600 transition-colors" />
          </div>
        </div>

        <button
          type="submit"
          :disabled="submitting"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          <span v-if="submitting">提交中...</span>
          <span v-else>申请友链</span>
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}

/* 滚动淡入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}
</style>
