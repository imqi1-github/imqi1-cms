<script setup lang="ts">
import "@/assets/css/fancybox.css";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";

import type { RelatedContent } from "~/types/apis/content/related-contents";
import LivePhoto from "~/components/LivePhoto.vue";
import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import { siteConfig } from "~~/site.config";
import type { TocItem } from "~/types/apis/toc";
import type { MarkdownAttachmentImage, MarkdownImageDimensions } from "~/types/pages/content-detail";

const route = useRoute();
const categorySlug = route.params.category as string;
const slug = route.params.slug as string;

// 离场淡出：旧页在新页数据就绪前完整淡出（Suspense 挂起时长覆盖 fadeDuration），SSR/水合为 no-op
await useFadeOutOnNavigate();

// 从 URL 获取分类信息
const { data: categoryData } = await useFetch(`/api/category/${categorySlug}`, {
  headers: getInternalRequestHeaders(),
});
const categoryFromUrl = computed(() => categoryData.value?.data || null);

const isHydrated = ref(false);

// 格式化为绝对日期（SSR 与客户端首屏一致，不依赖当前时间）
function formatAbsoluteDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 格式化日期：hydration 完成前返回绝对日期，完成后返回相对时间
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isHydrated.value) {
    return formatAbsoluteDate(d);
  }
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}年前`;
  if (months > 0) return `${months}个月前`;
  if (weeks > 0) return `${weeks}周前`;
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return "刚刚";
}

// 获取文章数据 - 使用新的 API 格式
const { data, pending, error, refresh } = await useFetch(`/api/contents/${categorySlug}/${slug}`, {
  headers: getInternalRequestHeaders(),
});

const content = computed(() => data.value?.data);

// 仅当真实 404（文章不存在）才算未找到，避免瞬时 500/超时被 SSR 固化成 404、客户端误显示「文章未找到」。
// 对照 category/[slug].vue：用 error.statusCode===404 判别，其余错误走 isError 呈现可重试态。
const isNotFound = computed(() => !pending.value && !content.value && (error.value?.statusCode === 404 || error.value?.status === 404));
// 非 404 的加载错误（瞬时 DB 抖动/网络/超时）：保留标题并给重试，不触发 setResponseStatus(404)
const isError = computed(() => !pending.value && !!error.value && !isNotFound.value);

// 文章不存在时让 SSR 返回 404（后端 API 已抛 404，但页面需显式设置状态码，否则 SSR 返 200 形成 soft-404）
if (import.meta.server) {
  const event = useRequestEvent();
  if (event && isNotFound.value) setResponseStatus(event, 404);
}

const categories = computed(() => content.value?.contentrelations?.map(r => r.metas) || []);
const covers = computed(() => content.value?.parsedCovers || []);
const tags = computed(() => content.value?.tags || []);

// 判断封面类型
const hasCover = computed(() => covers.value.length > 0);
const hasManyCovers = computed(() => content.value?.many_covers && covers.value.length > 1);

const firstCover = computed(() => covers.value[0]);
const firstCoverUrl = computed(() => firstCover.value?.url || "");

const stripUrlDecorations = (value: string) => {
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf("?");
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
};

const getImageFileName = (value: string) => {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || "";
};

const normalizeImagePathname = (value: string) => {
  const clean = stripUrlDecorations(value);
  try {
    return new URL(clean).pathname;
  } catch {
    return clean;
  }
};

const normalizeImageKey = (value: string) => {
  try {
    return decodeURIComponent(normalizeImagePathname(value).replace(/^\/+/, ""));
  } catch {
    return normalizeImagePathname(value).replace(/^\/+/, "");
  }
};

const buildImageKeys = (url: string) => {
  const key = normalizeImageKey(url);
  const candidates = [key];

  if (!key.startsWith("uploads/")) {
    candidates.push(`uploads/${key}`);

    const fileName = getImageFileName(key);
    const datedName = /^(\d{4})-(\d{2})-\d{2}-/.exec(fileName);
    if (datedName) {
      candidates.push(`uploads/${datedName[1]}/${datedName[2]}/${fileName}`);
    }
  } else {
    candidates.push(key.replace(/^uploads\//, ""));
  }

  const fileName = getImageFileName(key);
  if (fileName) {
    candidates.push(fileName);
  }

  return new Set(candidates.filter(Boolean));
};

const hasSharedImageKey = (a: Set<string>, b: Set<string>) => {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
};

const markdownImageAttachments = computed(() => {
  const images = (content.value?.markdownImages || []) as MarkdownAttachmentImage[];
  return images.map(image => ({
    keys: buildImageKeys(image.url),
    width: image.width,
    height: image.height,
  }));
});

const findMarkdownImageDimensions = (url: string): MarkdownImageDimensions => {
  const imageKeys = buildImageKeys(url);
  const matched = markdownImageAttachments.value.find(image => hasSharedImageKey(image.keys, imageKeys));

  return {
    width: matched?.width ?? null,
    height: matched?.height ?? null,
  };
};

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const commentEnabled = computed(() => siteSettings.value?.commentEnabled ?? true);

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth } = useAuth();

// 判断是否为图片分类
const photoCategorySlug = computed(() => siteSettings.value?.photoCategorySlug || "shot");
const isPhotoCategory = computed(() => categorySlug === photoCategorySlug.value);

// 获取相关文章（根据标签筛选）
const relatedContentsData = ref<{ success: boolean; data: RelatedContent[] } | null>(null);
const relatedContentsPending = ref(false);

// 监听文章数据，加载后再获取相关文章。
// 仅客户端：immediate 会在 SSR setup 也触发（content 已由顶层 useFetch 填充），服务端自取会被丢弃且
// 不序列化 → 双发；此处用 import.meta.client 守卫 + 卸载守卫，避免双发与卸载后回写。
let relatedActive = true;
onUnmounted(() => {
  relatedActive = false;
});
watch(
  () => content.value?.cid,
  async contentId => {
    if (!import.meta.client || !contentId || !relatedActive) return;
    relatedContentsPending.value = true;
    try {
      const res = await $fetch<{ success: boolean; data: RelatedContent[] }>(`/api/related-contents/${contentId}?limit=3`, {
        headers: getInternalRequestHeaders(),
      });
      if (relatedActive) relatedContentsData.value = res;
    } catch (error) {
      console.error("获取相关文章失败:", error);
      if (relatedActive) relatedContentsData.value = { success: false, data: [] };
    } finally {
      if (relatedActive) relatedContentsPending.value = false;
    }
  },
  { immediate: true },
);

const relatedContents = computed(() => {
  if (!relatedContentsData.value?.success || !content.value) return [];
  return relatedContentsData.value.data.slice(0, 3);
});

const tocItems = ref<TocItem[]>([]);
const activeTocId = ref("");

// 根据文章的 show_toc 字段预留目录区域，避免客户端提取目录后产生布局偏移
const shouldReserveToc = computed(() => Boolean(content.value?.show_toc));

// 根据文章的 show_toc 字段和实际标题数量决定是否显示目录内容
const showToc = computed(() => {
  return shouldReserveToc.value && tocItems.value.length > 0;
});

// 提取目录
const extractToc = () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  const contentBody = document.querySelector(".article-body");
  if (!contentBody) return;

  const headings = contentBody.querySelectorAll("h2, h3");
  const items: TocItem[] = [];

  headings.forEach((heading, index) => {
    const id = `heading-${index}`;
    heading.id = id;
    items.push({
      id,
      text: heading.textContent || "",
      level: heading.tagName === "H2" ? 2 : 3,
    });
  });

  tocItems.value = items;
};

// 滚动到指定标题
const scrollToHeading = (id: string) => {
  const element = document.getElementById(id);
  if (element) {
    const headerOffset = 100;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.scrollY - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });

    activeTocId.value = id;
  }
};

// 滚动到指定评论
const scrollToComment = (hash: string) => {
  // 只在客户端执行
  if (!import.meta.client) return;

  // 从 hash 中提取评论 ID（格式：#comment-123）
  const commentId = hash.replace(/^#comment-/, "");
  if (!commentId) return;

  const elementId = `comment-${commentId}`;
  const element = document.getElementById(elementId);

  if (element) {
    const headerOffset = 130;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.scrollY - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });

    // 高亮评论
    element.classList.add("ring-2", "ring-blue-500", "ring-offset-2", "dark:ring-offset-slate-900");
    setTimeout(() => {
      element.classList.remove("ring-2", "ring-blue-500", "ring-offset-2", "dark:ring-offset-slate-900");
    }, 3000);
  }
};

// 监听滚动，更新当前激活的目录项
const handleTocScroll = () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  try {
    const headings = document.querySelectorAll(".article-body h2, .article-body h3");
    let currentId = "";

    headings.forEach(heading => {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= 150) {
        currentId = heading.id;
      }
    });

    if (currentId) {
      activeTocId.value = currentId;
    }
  } catch (error) {
    console.error("目录滚动监听错误:", error);
  }
};

// 页面元数据
// 使用一个固定的初始值，避免服务端和客户端不一致
const pageTitle = ref(`文章加载中... - ${siteName.value}`);

// 在数据加载完成后更新标题
watch(
  [content, isNotFound],
  ([newContent, notFound]) => {
    if (notFound) {
      pageTitle.value = `页面未找到 - ${siteName.value}`;
    } else if (newContent?.title) {
      pageTitle.value = `${newContent.title} - ${siteName.value}`;
    }
  },
  { immediate: true },
);

// SEO 元数据
const seoMeta = computed(() => {
  // 文章不存在或加载中时仍需设置标题（pageTitle 已由 watch 维护），否则文档 <title> 会缺失
  if (!content.value) return { title: pageTitle.value };

  // 统一用站点 URL + 路由路径：og:url / canonical 必须稳定，不应随客户端 query/hash 变化
  const fullUrl = `${siteConfig.siteUrl}${route.path}`;

  const keywords = tags.value.map(tag => tag.name).join(", ");
  const description = content.value.desc || "";
  const coverImage = firstCoverUrl.value;
  const authorName = content.value.user?.nickname || content.value.user?.name || siteConfig.siteName;
  const publishDate = content.value.create_time || content.value.update_time;
  const modifyDate = content.value.update_time;

  return {
    title: pageTitle.value,
    meta: [
      // 基础元信息
      { name: "description", content: description },
      { name: "keywords", content: keywords },
      { name: "author", content: authorName },

      // Open Graph
      { property: "og:type", content: "article" },
      { property: "og:title", content: content.value.title },
      { property: "og:description", content: description },
      { property: "og:image", content: coverImage },
      { property: "og:url", content: fullUrl },
      { property: "og:site_name", content: siteName.value },
      { property: "article:published_time", content: publishDate },
      { property: "article:modified_time", content: modifyDate },
      { property: "article:author", content: authorName },
      ...categories.value.map(cat => ({
        property: "article:section",
        content: cat.name,
      })),
      ...tags.value.map(tag => ({
        property: "article:tag",
        content: tag.name,
      })),

      // Twitter Card
      { name: "twitter:card", content: coverImage ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: content.value.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: coverImage },
      { name: "twitter:site", content: siteConfig.seo.twitterSite },

      // 其他
      { name: "robots", content: "index, follow" },
      { name: "googlebot", content: "index, follow" },
    ],
    link: [
      {
        rel: "canonical",
        href: fullUrl,
      },
    ],
  };
});

useHead(() => seoMeta.value);

// 文章手机端扫码查看：复用 /api/qr 通用接口，QR 内容为规范 URL
const articleQr = computed(() => `/api/qr?text=${encodeURIComponent(`${siteConfig.siteUrl}${route.path}`)}`);

// 小程序码（「文章小程序端看」）：懒加载，避免每篇都调微信 API；出错自动隐藏
const miniQrUrl = computed(() => `/api/mini/qrcode?cid=${content.value?.cid ?? ""}`);
const miniQrFailed = ref(false);
// CC 栏入口：悬浮显示对应码；小程序在 site.config 开启且运行时配了凭据才显示
const hoverQr = ref<"mobile" | "mini" | null>(null);
const { miniQrEnabled } = useSiteSettings();
const mobileQrEnabled = siteConfig.features.mobileQr;
const miniQrShown = computed(() => siteConfig.features.miniQr && miniQrEnabled.value && !miniQrFailed.value);

// 悬浮出码：离开胶囊/码后延迟关闭，给「从胶囊移到码」留时间；码用绝对定位避免挤占布局
let qrHideTimer: ReturnType<typeof setTimeout> | null = null;
function showQr(v: "mobile" | "mini") {
  if (qrHideTimer) {
    clearTimeout(qrHideTimer);
    qrHideTimer = null;
  }
  hoverQr.value = v;
}
function keepQr() {
  if (qrHideTimer) {
    clearTimeout(qrHideTimer);
    qrHideTimer = null;
  }
}
function hideQrSoon() {
  if (qrHideTimer) clearTimeout(qrHideTimer);
  qrHideTimer = setTimeout(() => {
    hoverQr.value = null;
  }, 180);
}

// 监听文章数据变化，触发渐入动画
watch(
  () => content.value,
  newContent => {
    // 设置页面标题供导航栏使用
    if (newContent?.title) {
      const { setPageTitle, setPageCategory } = usePageTitle();
      setPageTitle(newContent.title, "ri:file-edit-line");

      // 设置分类信息（从 URL 查询的分类信息中获取）
      if (categoryFromUrl.value) {
        setPageCategory({
          name: categoryFromUrl.value.name,
          slug: categoryFromUrl.value.slug ?? "",
        });
      }
    }

    // 只在客户端执行
    if (import.meta.client && newContent) {
      // 使用 setTimeout 确保 DOM 完全渲染
      setTimeout(() => {
        const article = document.querySelector("article.animate-fade-in");
        if (!article) return;

        const header = article.querySelector("header.article-cover");
        const contentBody = article.querySelector(".article-body");
        const metaLicenseBox = article.querySelector(".meta-license-box");

        // 首先渐入文章主要内容
        header?.classList.remove("opacity-0", "translate-y-8");
        header?.classList.add("opacity-100", "translate-y-0");
        contentBody?.classList.remove("opacity-0", "translate-y-8");
        contentBody?.classList.add("opacity-100", "translate-y-0");
        metaLicenseBox?.classList.remove("opacity-0", "translate-y-8");
        metaLicenseBox?.classList.add("opacity-100", "translate-y-0");
      }, 100);
    }
  },
  { immediate: true },
);

// 监听相关文章数据，触发渐入动画
watch(
  () => relatedContents.value,
  contents => {
    if (import.meta.client) {
      nextTick(() => {
        setTimeout(() => {
          // 只有当相关文章有数据时才触发相关文章区域的动画
          if (contents && contents.length > 0) {
            const relatedSection = document.querySelector(".related-contents-section");
            if (relatedSection && relatedSection.classList.contains("opacity-0")) {
              relatedSection.classList.remove("opacity-0", "translate-y-8");
              relatedSection.classList.add("opacity-100", "translate-y-0");
            }
          }

          // 无论是否有相关文章，都触发评论区的渐入动画
          const commentSection = document.querySelector(".comment-section");
          if (commentSection && commentSection.classList.contains("opacity-0")) {
            commentSection.classList.remove("opacity-0", "translate-y-8");
            commentSection.classList.add("opacity-100", "translate-y-0");
          }
        }, 200);
      });
    }
  },
);

// 独立监听评论区，确保即使没有相关文章也能渐入
watch(
  () => [content.value?.cid, commentEnabled.value],
  ([contentId, enabled]) => {
    if (import.meta.client && contentId && enabled) {
      nextTick(() => {
        setTimeout(() => {
          const commentSection = document.querySelector(".comment-section");
          if (commentSection && commentSection.classList.contains("opacity-0")) {
            commentSection.classList.remove("opacity-0", "translate-y-8");
            commentSection.classList.add("opacity-100", "translate-y-0");
          }
        }, 300);
      });
    }
  },
);

// 监听路由 hash 变化，滚动到评论
watch(
  () => route.hash,
  newHash => {
    if (newHash && newHash.startsWith("#comment-")) {
      // 等待 DOM 更新和评论渲染
      nextTick(() => {
        // 多次尝试以确保评论已渲染
        let attempts = 0;
        const maxAttempts = 10;
        const checkAndScroll = () => {
          const commentId = newHash.replace(/^#comment-/, "");
          const element = document.getElementById(`comment-${commentId}`);
          if (element || attempts >= maxAttempts) {
            scrollToComment(newHash);
          } else {
            attempts++;
            setTimeout(checkAndScroll, 100);
          }
        };
        checkAndScroll();
      });
    }
  },
  { immediate: true },
);

// Fancybox 容器引用
const fancyboxContainer = useTemplateRef<HTMLDivElement>("fancyboxContainer");
let FancyboxModule: typeof import("@fancyapps/ui") | null = null;

// markdown 正文客户端增强（代码复制/展开/标签 + 富组件/图片水合），由 useMarkdownContent 统一挂载与清理
const markdownContent = useMarkdownContent({ findImageDimensions: findMarkdownImageDimensions });

// 灯箱实况照片增强：在 Fancybox 灯箱中为实况照片注入视频播放能力
const { enhanceConfig: enhanceFancyboxLivePhoto } = useFancyboxLivePhoto();

// 将非关键初始化延后到浏览器空闲帧，避免与页面渐入抢占主线程
const runIdle = (cb: () => void) => {
  if (import.meta.client && typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(cb, { timeout: 1000 });
  } else {
    setTimeout(cb, 300);
  }
};

// 初始化 Fancybox 和其他功能
onMounted(async () => {
  isHydrated.value = true;

  try {
    // 动态导入 Fancybox（仅客户端）
    FancyboxModule = await import("@fancyapps/ui");

    // 初始化 Fancybox（参照友情链接页面）
    FancyboxModule.Fancybox.bind(
      fancyboxContainer.value,
      "[data-fancybox]",
      enhanceFancyboxLivePhoto({
        l10n: zh_CN,
        Hash: false,
        Carousel: {
          Zoomable: {
            Panzoom: {
              maxScale: 2,
            },
          },
          Toolbar: {
            display: {
              left: ["infobar"],
              middle: ["zoomIn", "zoomOut", "toggleZoom", "rotateCCW", "rotateCW", "flipX", "flipY"],
              right: ["thumbs", "close"],
            },
          },
          Autoplay: {
            autoStart: false,
          },
        },
      }),
    );

    // markdown 正文增强（代码复制/展开/标签 + 富组件/图片水合），逻辑见 composables/useMarkdownContent.ts
    markdownContent.mount();

    // 初始化目录
    nextTick(() => {
      // 目录构建与滚动监听延后到 idle，避免与首屏渐入抢占主线程帧
      runIdle(() => {
        extractToc();
        window.addEventListener("scroll", handleTocScroll);
      });
    });
  } catch (error) {
    console.error("页面功能初始化失败:", error);
  }
});

// 清理 Fancybox 和滚动监听
onUnmounted(() => {
  if (FancyboxModule) {
    FancyboxModule.Fancybox.unbind(fancyboxContainer.value);
  }
  window.removeEventListener("scroll", handleTocScroll);

  // markdown 正文增强的清理（动态组件卸载 + 监听器剥离），逻辑见 composables/useMarkdownContent.ts
  markdownContent.cleanup();
});
</script>

<template>
  <div
    ref="fancyboxContainer"
    :class="[
      'mx-auto w-full flex flex-col justify-center items-center',
      isPhotoCategory ? (shouldReserveToc ? 'max-w-375' : 'max-w-350') : shouldReserveToc ? 'max-w-250' : 'max-w-225',
    ]">
    <div v-if="pending" class="py-20 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
      <p class="mt-2 text-slate-500">加载中...</p>
    </div>

    <NotFound v-else-if="isNotFound" />

    <!-- 非 404 加载错误：保留标题并给重试，避免瞬时故障被渲染成 NotFound/被 SSR 写成 404 -->
    <div v-else-if="isError" class="text-center py-24 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
      <Icon name="lucide:alert-circle" aria-hidden="true" class="size-12 text-destructive mx-auto mb-4" />
      <h2 class="text-xl font-bold mb-2">加载失败</h2>
      <p class="text-muted-foreground mb-4">请稍后重试</p>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
        @click="refresh()">
        <Icon name="lucide:refresh-cw" class="size-4" />
        重试
      </button>
    </div>

    <article v-else-if="content" class="w-full animate-fade-in">
      <!-- 标题区域 -->
      <header :class="['opacity-0 translate-y-8 duration-300 ease-out', !hasCover ? 'flex flex-col items-center' : '']" class="article-cover">
        <!-- 多封面轮播 -->
        <CoverSwiper v-if="hasManyCovers" :covers="covers" :is-photo-category="isPhotoCategory" />

        <!-- 单封面 -->
        <LivePhoto
          v-else-if="hasCover"
          :src="firstCoverUrl"
          alt="封面"
          :aspect-ratio="firstCover?.width && firstCover?.height ? `${firstCover.width} / ${firstCover.height}` : undefined"
          :hover-play="false"
          data-fancybox="gallery"
          :data-caption="covers[0]?.desc || '封面'"
          :class="
            [
              'w-full h-full object-cover border border-gray-200 dark:border-gray-800 mb-5 cursor-zoom-in',
              isPhotoCategory ? 'max-h-150' : 'max-h-37.5',
            ].join(' ')
          " />

        <!-- 标题 -->
        <h1 id="article-title" class="text-[3em] font-extrabold leading-tight mb-2.5 text-slate-900 dark:text-slate-100 wrap-break-word">
          {{ content.title }}
        </h1>

        <!-- 描述/摘要 -->
        <div class="mb-5">
          <div v-if="content.desc" class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {{ content.desc }}
          </div>
          <!-- 编辑按钮（仅登录时显示） -->
          <ClientOnly>
            <a
              v-if="isLoggedIn && !isLoadingAuth"
              :href="`/admin/contents/edit?cid=${content.cid}`"
              target="_blank"
              class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2">
              <Icon name="lucide:edit" class="size-3" />
              编辑此文章
            </a>
          </ClientOnly>
        </div>
      </header>

      <!-- 文章内容区域 - 带目录 -->
      <div class="flex gap-8 relative w-full">
        <!-- 目录侧边栏 - 左侧 -->
        <aside v-if="shouldReserveToc" class="toc-sidebar hidden lg:block w-48 shrink-0 order-first">
          <nav v-if="showToc" class="toc-nav sticky top-24 w-fit">
            <h3 class="px-2 text-sm font-medium text-slate-900 dark:text-slate-100 mb-3 w-fit max-w-full">目录</h3>
            <ul class="space-y-1 w-fit max-w-48">
              <li v-for="item in tocItems" :key="item.id" class="max-w-48 wrap-anywhere overflow-hidden text-ellipsis">
                <button
                  :class="[
                    'block text-sm py-1 px-2 rounded transition-colors no-underline text-left cursor-pointer',
                    item.level === 3 ? 'pl-4' : '',
                    activeTocId === item.id
                      ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
                  ]"
                  @click="scrollToHeading(item.id)">
                  {{ item.text }}
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <!-- 文章正文 -->
        <MarkdownBody :html="content.renderedContent" class="min-w-0 w-full opacity-0 translate-y-8 duration-300 ease-out" />
      </div>

      <!-- 元信息盒子和 CC 授权 -->
      <div class="mt-4 p-4 borde rounded-lg w-full opacity-0 translate-y-8 duration-300 ease-out meta-license-box">
        <!-- 元信息 -->
        <div class="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span v-tooltip="'作者'" class="inline-flex items-center gap-0.5">
            <Icon name="ri:user-line" class="size-4" />
            <span>{{ content.user?.nickname || content.user?.name || "匿名" }}</span>
          </span>
          <span v-tooltip="'发布时间'" class="inline-flex items-center gap-0.5">
            <Icon name="ri:calendar-line" class="size-4" />
            <time :datetime="content.create_time">
              {{ formatDate(content.create_time) }}
            </time>
          </span>
          <span v-if="categories.length > 0" class="inline-flex items-center gap-0.5">
            <Icon name="ri:menu-line" class="size-4" />
            <NuxtLink
              v-for="(cat, index) in categories"
              :key="cat.mid"
              v-tooltip="'分类'"
              :to="`/category/${cat.slug}`"
              class="text-inherit no-underline transition-colors hover:text-blue-600">
              {{ cat.name }}{{ index < categories.length - 1 ? ", " : "" }}
            </NuxtLink>
          </span>
          <span v-if="tags.length > 0" class="inline-flex items-center gap-0.5">
            <Icon name="ri:hashtag" class="size-4" />
            <NuxtLink
              v-for="(tag, index) in tags"
              :key="index"
              v-tooltip="'标签'"
              :to="tag.slug ? `/tag/${tag.slug}` : '#'"
              :class="[
                'hover:text-blue-600 dark:hover:text-blue-500 transition-colors mr-2',
                tag.slug ? 'cursor-pointer' : 'cursor-default opacity-50',
              ]">
              {{ tag.name }}
            </NuxtLink>
          </span>
        </div>

        <!-- CC 协议授权 -->
        <div class="mt-4 pt-4 border-t border-gray-300 dark:border-gray-700">
          <div class="cc-license flex items-center gap-1">
            <Icon name="ri:copyright-line" class="text-xs text-slate-600 dark:text-slate-400" />
            <p class="text-xs text-slate-600 dark:text-slate-400">
              若无特别说明，本文采用
              <a
                href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                CC BY-NC-SA 4.0
              </a>
              协议授权。
            </p>
          </div>

          <!-- 手机端 / 小程序 查看入口（一行文案 + 胶囊，悬浮显示码；小程序不可用只显示手机端） -->
          <div v-if="mobileQrEnabled || miniQrShown" class="mt-3 text-xs text-slate-600 dark:text-slate-400">
            <div class="flex flex-wrap items-center gap-1">
              <Icon mode="svg" name="ri:qr-code-line" class="size-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
              你也可以在
              <span v-if="mobileQrEnabled" class="relative inline-flex" @mouseenter="showQr('mobile')" @mouseleave="hideQrSoon()">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40 cursor-pointer">
                  <Icon mode="svg" name="ri:smartphone-line" class="size-3" />
                  手机浏览器
                </button>
                <div
                  v-if="hoverQr === 'mobile'"
                  class="absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-lg border border-gray-200 bg-white/95 p-1.5 shadow-md dark:border-gray-800 dark:bg-black/85"
                  @mouseenter="keepQr()"
                  @mouseleave="hideQrSoon()">
                  <img
                    :src="articleQr"
                    alt="手机端查看二维码"
                    class="block size-28 max-w-none object-contain rounded-md"
                    loading="lazy"
                    decoding="async" />
                </div>
              </span>
              <template v-if="mobileQrEnabled && miniQrShown">或</template>
              <span v-if="miniQrShown" class="relative inline-flex" @mouseenter="showQr('mini')" @mouseleave="hideQrSoon()">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40 cursor-pointer">
                  <img :src="publicAsset('/icons/wechat.svg')" class="size-3 shrink-0" alt="微信小程序" />
                  微信小程序
                </button>
                <div
                  v-if="hoverQr === 'mini' && miniQrShown"
                  class="absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-lg border border-gray-200 bg-white/95 p-1.5 shadow-md dark:border-gray-800 dark:bg-black/85"
                  @mouseenter="keepQr()"
                  @mouseleave="hideQrSoon()">
                  <img
                    :src="miniQrUrl"
                    alt="小程序码"
                    class="block size-28 max-w-none object-contain rounded-md"
                    loading="lazy"
                    decoding="async"
                    @error="miniQrFailed = true">
                </div>
              </span>
              中查看此内容
            </div>
          </div>

          <!-- 相关地点：逐地点渲染胶囊，点击跳转到地图足迹视图并聚焦该地点 -->
          <MapEntryLinks
            v-if="content.travels?.length"
            :places="(content.travels ?? []).map(t => ({ id: t.id, name: t.name }))"
            place-icon="ri:map-pin-line"
            title="作者在撰写此篇文章前，曾去过"
            class="mt-3" />
        </div>
      </div>

      <!-- 相关文章 -->
      <div v-if="relatedContentsPending" class="article-constrained flex items-center justify-center gap-2 py-4 text-muted-foreground">
        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
        <span class="text-sm">加载相关文章...</span>
      </div>
      <section
        v-if="relatedContents.length > 0"
        class="related-contents-section w-full opacity-0 translate-y-8 duration-300 ease-out article-constrained">
        <h3 class="text-xl font-semibold my-4 text-slate-900 dark:text-slate-100 h-max">相关文章</h3>
        <div class="flex flex-wrap gap-4">
          <div
            v-for="relatedContent in relatedContents"
            :key="relatedContent.cid"
            class="flex-1 min-w-50 min-h-50 relative flex flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-600 dark:hover:border-blue-500 hover:shadow-sm transition-all duration-300">
            <NuxtLink
              :to="`/content/${relatedContent.categories[0]?.slug || 'uncategorized'}/${relatedContent.slug}`"
              class="group flex flex-col size-full">
              <div v-if="relatedContent.covers && relatedContent.covers.length > 0" class="absolute inset-0">
                <img
                  :src="relatedContent.covers[0]?.url"
                  :alt="relatedContent.title"
                  class="object-cover group-hover:scale-[1.03] transition-transform duration-300 size-full"
                  loading="lazy"
                  decoding="async" />
              </div>
              <div v-else class="flex-1 flex items-center justify-center bg-gray-200 dark:bg-gray-800">
                <span class="text-4xl font-bold text-gray-400 dark:text-gray-600">{{
                  relatedContent.title ? relatedContent.title.charAt(0) : "?"
                }}</span>
              </div>
              <div
                class="w-full px-4 py-2"
                :class="
                  relatedContent.covers && relatedContent.covers.length > 0
                    ? 'cover-backdrop text-white absolute bottom-[-0.1px]'
                    : 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md'
                ">
                <h4
                  class="font-semibold line-clamp-1"
                  :class="relatedContent.covers && relatedContent.covers.length > 0 ? 'text-white' : 'text-slate-900 dark:text-slate-100'">
                  {{ relatedContent.title }}
                </h4>
                <p
                  class="text-xs line-clamp-1"
                  :class="relatedContent.covers && relatedContent.covers.length > 0 ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'">
                  {{ relatedContent.desc || "暂无描述" }}
                </p>
                <div
                  class="mt-0.5 text-xs"
                  :class="relatedContent.covers && relatedContent.covers.length > 0 ? 'text-white/70' : 'text-slate-500 dark:text-slate-500'">
                  {{ formatDate(relatedContent.created) }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- 评论区 -->
      <section v-if="commentEnabled" class="w-full opacity-0 translate-y-8 duration-300 ease-out animate-fade-in article-constrained comment-section">
        <CommentList :content-id="content.cid" :load-all-comments="!!route.hash && route.hash.startsWith('#comment-')" />
      </section>
    </article>
  </div>
</template>

<style scoped>
/* 渐入动画基础类 */
.animate-fade-in {
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.opacity-0 {
  opacity: 0;
}

.opacity-100 {
  opacity: 1;
}

.translate-y-0 {
  transform: translateY(0);
}

.translate-y-8 {
  transform: translateY(2rem);
}

.no-underline {
  text-decoration: none;
}

/* 封面和评论区约束宽度 */
.article-cover {
  width: 100%;
}

/* 实况照片容器样式 */
.live-photo-container {
  display: inline-block;
  width: 100%;
  height: auto;
}

.live-photo-wrapper {
  position: relative;
  overflow: hidden;
}

.live-photo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.3s ease-in-out;
}

.live-photo-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  transition: opacity 0.3s ease-in-out;
}

.live-photo-tip {
  position: absolute;
  top: 3px;
  left: 3px;
  text-align: center;
  z-index: 10;
  pointer-events: none;
}

.article-constrained {
  max-width: 56.25rem; /* 900px - same as max-w-225 */
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

/* 目录样式 */
.toc-sidebar {
  position: relative;
}

.toc-nav {
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  opacity: 0;
  transform: translateX(-20px);
  animation: toc-slide-in 0.5s ease-out forwards;
}

@keyframes toc-slide-in {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.toc-nav::-webkit-scrollbar {
  width: 4px;
}

.toc-nav::-webkit-scrollbar-track {
  background: transparent;
}

.toc-nav::-webkit-scrollbar-thumb {
  background: rgb(203 213 225);
  border-radius: 2px;
}

.dark .toc-nav::-webkit-scrollbar-thumb {
  background: rgb(71 85 105);
}

/* 响应式 */
@media (max-width: 768px) {
  .text-\[3em\] {
    font-size: 2em;
  }
}
</style>
