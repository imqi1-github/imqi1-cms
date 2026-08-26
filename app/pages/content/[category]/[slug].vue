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
import type { TocItem } from "~/types/apis/content";
import type { MarkdownAttachmentImage, MarkdownImageDimensions } from "~/types/pages/content-detail";
import { useMarkdownWidgets } from "~/composables/useMarkdownWidgets";

const route = useRoute();
const categorySlug = route.params.category as string;
const slug = route.params.slug as string;

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
const { data, pending, error } = await useFetch(`/api/contents/${categorySlug}/${slug}`, {
  headers: getInternalRequestHeaders(),
});

const content = computed(() => data.value?.data);

// 判断文章是否存在
const isNotFound = computed(() => !pending.value && (!content.value || error.value));

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

// 监听文章数据，加载后再获取相关文章
watch(
  () => content.value?.cid,
  async contentId => {
    if (contentId) {
      relatedContentsPending.value = true;
      try {
        relatedContentsData.value = await $fetch<{ success: boolean; data: RelatedContent[] }>(`/api/related-contents/${contentId}?limit=3`, {
          headers: getInternalRequestHeaders(),
        });
      } catch (error) {
        console.error("获取相关文章失败:", error);
        relatedContentsData.value = { success: false, data: [] };
      } finally {
        relatedContentsPending.value = false;
      }
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

// Markdown 图片增强（兼容旧文章中 #live / [live] 写法，普通图片加 caption 浮层）
const { mount: mountMarkdownImages, unmount: unmountMarkdownImages } = useMarkdownImages();

// Markdown widget 挂载器清理句柄（onMounted 内由 useMarkdownWidgets 赋值，onUnmounted 调用以卸载所有动态挂载组件）
let cleanupWidgets: (() => void) | null = null;

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

    // 初始化代码复制按钮
    document.querySelectorAll(".markdown-body pre.shiki").forEach(pre => {
      const code = pre.querySelector("code");
      // 提取语言名称
      let lang = "";
      let fileName = "";

      if (code) {
        const langClass = Array.from(code.classList).find(c => c.startsWith("language-"));
        if (langClass) {
          const fullLang = langClass.replace("language-", "");

          // 检测是否为 "语言+文件名" 格式 (如 "js+main.js")
          const separatorIndex = fullLang.indexOf("+");
          const possibleFileName = separatorIndex > 0 ? fullLang.slice(separatorIndex + 1) : "";
          if (possibleFileName && /[./\\]/.test(possibleFileName)) {
            lang = fullLang.slice(0, separatorIndex);
            fileName = possibleFileName;
            pre.classList.add("has-file-name");
          } else if (separatorIndex > 0) {
            lang = fullLang.slice(0, separatorIndex);
          } else {
            lang = fullLang;
          }
        }
      }

      const langNames: Record<string, string> = {
        js: "Javascript",
        ts: "Typescript",
        py: "Python",
        rb: "Ruby",
        rs: "Rust",
        kt: "Kotlin",
        sh: "Shell",
        yml: "Yaml",
        md: "Markdown",
      };

      const formatLangName = (value: string) => {
        if (!value) return "";
        return langNames[value.toLowerCase()] || `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
      };

      const displayLangName = formatLangName(lang);

      // 服务端已根据行数输出 code-collapsed，客户端只给折叠遮罩绑定展开交互，避免代码正文点击误触
      const isCollapsed = pre.classList.contains("code-collapsed");
      let expandButton: HTMLButtonElement | null = null;

      if (isCollapsed) {
        expandButton = document.createElement("button");
        expandButton.type = "button";
        expandButton.className = "code-expand-button";
        expandButton.ariaLabel = "展开代码块";
        expandButton.textContent = "...";
        expandButton.addEventListener("click", e => {
          e.stopPropagation();
          pre.classList.remove("code-collapsed");
          expandButton?.remove();
        }, { once: true });
      }

      let fileLabel: HTMLSpanElement | null = null;
      let langLabel: HTMLSpanElement | null = null;
      if (fileName) {
        fileLabel = document.createElement("span");
        fileLabel.className = "file-label";
        fileLabel.textContent = fileName;
        fileLabel.setAttribute("data-file", fileName);
        fileLabel.setAttribute("data-lang", displayLangName);
      }

      if (displayLangName) {
        langLabel = document.createElement("span");
        langLabel.className = "lang-label";
        langLabel.textContent = displayLangName;

        const iconMap: Record<string, string> = {
          js: "/icons/javascript.svg",
          jsx: "/icons/javascript.svg",
          javascript: "/icons/javascript.svg",
          mjs: "/icons/javascript.svg",
          cjs: "/icons/javascript.svg",
          ts: "/icons/typescript.svg",
          tsx: "/icons/typescript.svg",
          typescript: "/icons/typescript.svg",
          vue: "/icons/vue.svg",
          css: "/icons/css.svg",
          scss: "/icons/css.svg",
          less: "/icons/css.svg",
          html: "/icons/html.svg",
          htm: "/icons/html.svg",
          json: "/icons/json.svg",
          jsonc: "/icons/json.svg",
          md: "/icons/markdown.svg",
          markdown: "/icons/markdown.svg",
          py: "/icons/python.svg",
          python: "/icons/python.svg",
          php: "/icons/php.svg",
          java: "/icons/java.svg",
          sh: "/icons/bash.svg",
          bash: "/icons/bash.svg",
          shell: "/icons/bash.svg",
          ps1: "/icons/powershell.svg",
          powershell: "/icons/powershell.svg",
          sql: "/icons/sql.svg",
          yaml: "/icons/yaml.svg",
          yml: "/icons/yaml.svg",
          xml: "/icons/xml.svg",
          ini: "/icons/ini.svg",
          toml: "/icons/ini.svg",
          conf: "/icons/ini.svg",
          cfg: "/icons/ini.svg",
        };

        const ext = (fileName.match(/\.(\w+)$/) || [])[1]?.toLowerCase() || "";
        const iconKey = ext || lang.toLowerCase();
        const iconUrl = iconMap[iconKey];
        if (iconUrl && fileLabel) {
          fileLabel.classList.add("has-icon");
          fileLabel.style.setProperty("--icon-url", `url("${publicAsset(iconUrl)}")`);
        }
      }

      // 创建复制按钮
      const button = document.createElement("button");
      button.className = "copy-button";
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;
      button.ariaLabel = "复制代码";

      const copyIcon = button.innerHTML;
      const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

      const copyCode = async (e: Event) => {
        e.stopPropagation(); // 阻止冒泡，避免触发折叠切换
        if (code) {
          const text = code.textContent || "";
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            // fallback for older browsers
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }
          button.classList.add("copied");
          button.innerHTML = checkIcon;
          setTimeout(() => {
            button.classList.remove("copied");
            button.innerHTML = copyIcon;
          }, 2000);
        }
      };

      button.addEventListener("click", copyCode);
      if (fileLabel) {
        pre.appendChild(fileLabel);
      }
      if (langLabel) {
        pre.appendChild(langLabel);
      }
      pre.appendChild(button);
      if (expandButton) {
        pre.appendChild(expandButton);
      }
    });

    // 初始化目录
    nextTick(() => {
      // 目录构建与滚动监听延后到 idle，避免与首屏渐入抢占主线程帧
      runIdle(() => {
        extractToc();
        window.addEventListener("scroll", handleTocScroll);
      });

      // 添加轮播图样式
      const style = document.createElement("style");
      style.textContent = `
      /* Markdown LivePhoto 动态挂载容器仅用于 Vue render/unmount，不参与布局，避免影响 Swiper/Flex 尺寸计算 */
      .markdown-live-photo-mount {
        display: contents;
      }

      /* Markdown Swiper 样式 - 使用更具体的选择器避免影响其他轮播图 */
      .swiper-container[class*="markdown-swiper-instance"] {
        overflow: hidden;
        position: relative;
        width: 100%;
      }

      .swiper-container[class*="markdown-swiper-instance"]:not(.swiper-initialized) > .swiper-wrapper {
        gap: 20px;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-wrapper {
        display: flex;
        height: 650px;
        transition-timing-function: ease;
        width: 100%;
        z-index: 1;
        flex-wrap: nowrap;
        border-radius: 15px;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-wrapper.noneed {
        height: 400px;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-slide {
        width: auto;
        max-width: 100%;
        flex-shrink: 0;
        height: 100%;
        position: relative;
        border: 1px solid rgb(229 231 235);
        border-radius: 15px;
        overflow-x: hidden;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .dark .swiper-container[class*="markdown-swiper-instance"] .swiper-slide {
        border-color: rgb(51 65 85);
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-img {
        display: block;
        height: 100%;
        width: auto;
        max-width: 100%;
        object-fit: contain;
        flex-shrink: 0;
        cursor: zoom-in;
      }

      .swiper-img {
        height: 100%;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-slide-title {
        text-align: center;
        color: white;
        padding: 8px 12px;
        font-size: 13px;
        line-height: 1.4;
        width: 100%;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
        padding: 12px 12px 4px 12px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.247), transparent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: 0;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-slide::-webkit-scrollbar {
        width: 4px;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-slide::-webkit-scrollbar-track {
        background: transparent;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-slide::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 2px;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-slide::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.3);
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-buttons {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-pagination {
        display: flex;
        flex-grow: 1;
        gap: 2px;
      }

      .swiper-container[class*="markdown-swiper-instance"] :deep(.swiper-pagination-bullet) {
        background: rgb(148 163 184);
        border-radius: 4px;
        display: inline-block;
        height: 8px;
        transition: 0.15s;
        width: 8px;
        opacity: 1;
      }

      .swiper-container[class*="markdown-swiper-instance"] :deep(.swiper-pagination-bullet-active) {
        background: rgb(37 99 235);
      }

      .swiper-container[class*="markdown-swiper-instance"] :deep(.swiper-pagination-bullet:hover) {
        background: rgb(37 99 235);
        opacity: 1;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-button-prev,
      .swiper-container[class*="markdown-swiper-instance"] .swiper-button-next {
        align-items: center;
        color: rgb(148 163 184);
        cursor: pointer;
        display: flex;
        justify-content: center;
        width: 16px;
        height: 16px;
        transition: 0.15s;
        position: static;
        margin: 0;
      }

      .swiper-container[class*="markdown-swiper-instance"] .swiper-button-prev:hover,
      .swiper-container[class*="markdown-swiper-instance"] .swiper-button-next:hover {
        color: rgb(37 99 235);
      }

      .swiper-container[class*="markdown-swiper-instance"] :deep(.swiper-button-disabled) {
        cursor: auto;
        opacity: 0.35;
        pointer-events: none;
      }

      @media (max-width: 768px) {
        .swiper-container[class*="markdown-swiper-instance"] .swiper-wrapper {
          height: 350px;
        }

        .swiper-container[class*="markdown-swiper-instance"] .swiper-wrapper.noneed {
          height: 250px;
        }
      }

      /* 瀑布流图片样式 */
      .markdown-waterfall .waterfall-grid {
        column-count: 3;
        column-gap: 16px;
      }

      @media (max-width: 1024px) {
        .markdown-waterfall .waterfall-grid {
          column-count: 2;
        }
      }

      @media (max-width: 640px) {
        .markdown-waterfall .waterfall-grid {
          column-count: 1;
        }
      }

      .markdown-waterfall .waterfall-item {
        break-inside: avoid;
        margin-bottom: 16px;
      }

      .markdown-waterfall .waterfall-img-wrapper {
        position: relative;
        overflow: hidden;
        border-radius: 8px;
        background: rgb(243 244 246);
      }

      .markdown-waterfall .waterfall-img {
        width: 100%;
        height: auto;
        display: block;
        cursor: zoom-in;
      }

      .markdown-waterfall .waterfall-img-wrapper[style*="aspect-ratio"] .waterfall-img {
        height: 100%;
      }

      .markdown-waterfall .waterfall-caption {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
        padding: 12px 12px 4px 12px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.247), transparent);
        color: white;
        font-size: 13px;
        text-align: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .markdown-waterfall .waterfall-img-wrapper:hover .waterfall-caption {
        opacity: 1;
      }

      .dark .markdown-waterfall .waterfall-img-wrapper {
        background: rgb(31 41 55);
      }
    `;
      document.head.appendChild(style);

      // 初始化实况照片（兼容旧文章中 #live / [live] 图片写法，逻辑见 composables/useMarkdownImages.ts）
      mountMarkdownImages(document, {
        resolveDimensions: findMarkdownImageDimensions,
      });

      // 初始化 markdown 动态组件（折叠/视频/提示框/卡片/简单外链/轮播/仓库/瀑布流/音乐 + 实况照片）
      cleanupWidgets = useMarkdownWidgets(document.body, {
        findImageDimensions: findMarkdownImageDimensions,
      }).cleanup;
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

  // 卸载所有动态挂载的 markdown 组件（折叠/视频/提示框/卡片/简单外链/轮播/仓库/瀑布流/音乐 + 实况照片，触发各组件的 onUnmounted 清理）
  cleanupWidgets?.();

  // 卸载所有动态挂载的 LivePhoto 组件（触发其 onUnmounted 清理 Blob URL、定时器）
  unmountMarkdownImages();

  // 清理所有代码块的复制按钮监听器
  const copyButtons = document.querySelectorAll(".copy-button");
  copyButtons.forEach(button => {
    button.replaceWith(button.cloneNode(true));
  });

  // 清理所有代码块的点击监听器
  const codeBlocks = document.querySelectorAll("pre[class*='language-']");
  codeBlocks.forEach(pre => {
    pre.replaceWith(pre.cloneNode(true));
  });

  // 清理所有折叠容器的点击监听器
  const detailButtons = document.querySelectorAll(".markdown-details-summary");
  detailButtons.forEach(button => {
    button.replaceWith(button.cloneNode(true));
  });

  // 清理所有实况照片的监听器
  const liveVideos = document.querySelectorAll("video.live-photo-video");
  liveVideos.forEach(video => {
    video.replaceWith(video.cloneNode(true));
  });
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
        <div
          class="min-w-0 w-full opacity-0 translate-y-8 duration-300 ease-out markdown-body article-body"
          v-html="content.renderedContent" />
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
        </div>

        <!-- 相关地点：逐地点渲染胶囊，点击跳转到地图足迹视图并聚焦该地点 -->
        <MapEntryLinks
          v-if="content.travels?.length"
          :places="(content.travels ?? []).map(t => ({ id: t.id, name: t.name }))"
          place-icon="ri:map-pin-line"
          title="作者在撰写此篇文章前，曾去过"
          class="mt-4" />
      </div>

      <!-- 相关文章 -->
      <div v-if="relatedContentsPending" class="article-constrained flex items-center justify-center gap-2 py-4 text-muted-foreground">
        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
        <span class="text-sm">加载相关文章...</span>
      </div>
      <section v-if="relatedContents.length > 0" class="related-contents-section w-full opacity-0 translate-y-8 duration-300 ease-out article-constrained">
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
                  decoding="async">
              </div>
              <div v-else class="flex-1 flex items-center justify-center bg-gray-200 dark:bg-gray-800">
                <span class="text-4xl font-bold text-gray-400 dark:text-gray-600">{{ relatedContent.title ? relatedContent.title.charAt(0) : "?" }}</span>
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

/* 正文样式 */
.markdown-body {
  line-height: 1.8;
  word-wrap: break-word;
}

.markdown-body > * ~ * {
  margin-top: 1em;
}

/* 图片容器 */
.markdown-body :deep(.markdown-figure) {
  margin: 20px 0;
  text-align: center;
}

.markdown-body :deep(.markdown-figure img) {
  margin: auto;
}

/* 正文自定义组件 SSR 占位：避免客户端替换真实组件时从 0 高度突然撑开 */
.markdown-body :deep(.markdown-video-wrapper),
.markdown-body :deep(.markdown-video-container video) {
  aspect-ratio: 16 / 9;
  width: 100%;
  max-width: 100%;
  border-radius: 0.5rem;
  background: rgb(243 244 246);
}

.dark .markdown-body :deep(.markdown-video-wrapper),
.dark .markdown-body :deep(.markdown-video-container video) {
  background: rgb(31 41 55);
}

.markdown-body :deep(.markdown-repo-wrapper),
.markdown-body :deep(.markdown-card-wrapper) {
  display: block;
  min-height: 9rem;
}

.markdown-body :deep(.markdown-music-wrapper),
.markdown-body :deep(.markdown-simple-card-wrapper) {
  display: block;
  min-height: 6rem;
}

.markdown-body :deep(.markdown-swiper-wrapper) {
  display: block;
  min-height: 27rem;
}

.markdown-body :deep(.markdown-waterfall-wrapper),
.markdown-body :deep(.markdown-live-photo-wrapper) {
  display: block;
  min-height: min(60vh, 22rem);
  border-radius: 0.5rem;
  background: rgb(243 244 246);
}

.dark .markdown-body :deep(.markdown-waterfall-wrapper),
.dark .markdown-body :deep(.markdown-live-photo-wrapper) {
  background: rgb(31 41 55);
}

@media (max-width: 768px) {
  .markdown-body :deep(.markdown-swiper-wrapper) {
    min-height: 17.625rem;
  }

  .markdown-body :deep(.markdown-waterfall-wrapper),
  .markdown-body :deep(.markdown-live-photo-wrapper) {
    min-height: min(60vh, 18rem);
  }
}

/* 图片标题 */
.markdown-body :deep(.markdown-figcaption) {
  font-size: 0.875em;
  color: rgb(107 114 128);
  margin-top: 8px;
  line-height: 1.4;
}

.dark .markdown-body :deep(.markdown-figcaption) {
  color: rgb(156 163 175);
}

.markdown-body :deep(img:not(.swiper-container img):not(.markdown-card img):not(.markdown-simple-card img):not(.markdown-repo img)) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  cursor: zoom-in;
  margin: auto;
  transition: transform 0.3s ease;
}

/* 卡片类容器内的缩略图由模板尺寸类（size-full object-cover）控制，不套用通用图片规则 */
.markdown-body :deep(.markdown-card img),
.markdown-body :deep(.markdown-simple-card img),
.markdown-body :deep(.markdown-repo img) {
  height: 100%;
}

/* 大链接卡片左侧缩略图：hover 时平滑放大，过渡由 CSS 显式驱动，
   不依赖工具类（卡片 HTML 是 innerHTML 注入，group-hover/transition 工具类扫描不可靠） */
.markdown-body :deep(.markdown-card .markdown-card__thumb) {
  transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  will-change: transform;
}

.markdown-body :deep(.markdown-card a:hover) .markdown-card__thumb {
  transform: scale(1.06);
}

.markdown-body :deep(.markdown-image-container),
.markdown-body :deep(.markdown-live-photo-container) {
  --markdown-image-max-height: min(70vh, 46rem);
  width: 100%;
  max-width: 100%;
  margin-inline: auto;
}

.markdown-body :deep(.markdown-image-wrapper),
.markdown-body :deep(.markdown-live-photo-container > .live-photo-wrapper) {
  width: min(100%, calc(var(--markdown-image-max-height) * var(--markdown-image-ratio, 999)));
  max-width: 100%;
  max-height: var(--markdown-image-max-height);
  margin-inline: auto;
}

.markdown-body :deep(.markdown-image-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.markdown-body :deep(.markdown-image) {
  display: block;
  width: auto;
  height: 100%;
  max-width: 100%;
  max-height: var(--markdown-image-max-height);
  object-fit: contain;
}

.markdown-body :deep(.markdown-live-photo-container > .live-photo-wrapper) {
  overflow: hidden;
}

.markdown-body :deep(.markdown-live-photo-container .live-photo-image),
.markdown-body :deep(.markdown-live-photo-container .live-photo-video) {
  object-fit: contain;
}

.markdown-body
  :deep(p:not(.markdown-callout p):not(.markdown-card p):not(.swiper-slide-title p):not(.markdown-repo p):not(blockquote p):not(.aplayer-lrc p)) {
  text-indent: 2em;
}

.markdown-body :deep(h1):not(.markdown-callout h1):not(.markdown-card h1):not(.swiper-slide-title h1):not(.markdown-repo h1),
.markdown-body :deep(h2):not(.markdown-callout h2):not(.markdown-card h2):not(.swiper-slide-title h2):not(.markdown-repo h2),
.markdown-body :deep(h3):not(.markdown-callout h3):not(.markdown-card h3):not(.swiper-slide-title h3):not(.markdown-repo h3),
.markdown-body :deep(h4):not(.markdown-callout h4):not(.markdown-card h4):not(.swiper-slide-title h4):not(.markdown-repo h4),
.markdown-body :deep(h5):not(.markdown-callout h5):not(.markdown-card h5):not(.swiper-slide-title h5):not(.markdown-repo h5),
.markdown-body :deep(h6):not(.markdown-callout h6):not(.markdown-card h6):not(.swiper-slide-title h6):not(.markdown-repo h6) {
  font-weight: 700;
  line-height: 1.3;
}

.markdown-body :deep(h1) {
  font-size: 2em;
  /* border-bottom: 1px solid rgb(229 231 235); */
  padding-bottom: 0.3em;
}

.dark .markdown-body :deep(h1) {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  /* border-bottom: 1px solid rgb(229 231 235); */
  padding-bottom: 0.3em;
}

.dark .markdown-body :deep(h2) {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body :deep(h3) {
  font-size: 1.25em;
}

.markdown-body :deep(h4) {
  font-size: 1em;
}

.markdown-body :deep(a) {
  color: rgb(37 99 235);
  text-decoration: none;
}

.markdown-body :deep(a:hover):not(.markdown-card a):not(.markdown-simple-card a):not(.markdown-repo a) {
  text-decoration: underline;
}

.dark .markdown-body :deep(a) {
  color: rgb(96 165 250);
}

.markdown-body :deep(ul):not(.markdown-callout ul):not(.markdown-card ul):not(.markdown-repo ul):not(.aplayer-list ul),
.markdown-body :deep(ol):not(.markdown-callout ol):not(.markdown-card ol):not(.markdown-repo ol):not(.aplayer-list ol) {
  padding-left: 2em;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(li):not(.markdown-callout li):not(.markdown-card li):not(.markdown-repo li):not(.aplayer-list li) {
  margin: 0.5em 0;
  display: list-item;
}

.markdown-body :deep(blockquote):not(.markdown-callout blockquote):not(.markdown-card blockquote):not(.markdown-repo blockquote) {
  padding: 0.5em 1em;
  border-left: 4px solid rgb(37 99 235);
  background: rgb(249 250 251);
  color: rgb(107 114 128);
}

.dark .markdown-body :deep(blockquote):not(.markdown-callout blockquote):not(.markdown-card blockquote):not(.markdown-repo blockquote) {
  background: rgb(31 41 55);
  color: rgb(156 163 175);
}

.markdown-body :deep(code:not(pre code)) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background: rgb(243 244 246);
  border-radius: 3px;
}

.dark .markdown-body :deep(code:not(pre code)) {
  background: rgb(55 65 81);
}

/* Shiki 代码块样式 */
.markdown-body :deep(pre.shiki) {
  padding: 16px;
  overflow: visible;
  font-size: 0.875em;
  border-radius: 8px;
  position: relative;
  border: 1px solid rgb(229 231 235);
  counter-reset: line;
  /* 防止内容溢出容器 */
  max-width: 100%;
}

/* 代码内容单独处理滚动 */
.markdown-body :deep(pre.shiki > code) {
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  padding-block: 4px;
  /* 长代码自动换行 */
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  /* 默认隐藏滚动条 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

/* 悬浮时显示滚动条 */
.markdown-body :deep(pre.shiki:hover > code) {
  scrollbar-width: auto; /* Firefox */
}

.markdown-body :deep(pre.shiki:hover > code)::-webkit-scrollbar {
  display: block; /* Chrome, Safari, Opera */
}

/* 美化滚动条样式 */
.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar {
  height: 8px;
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-track {
  background: transparent;
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb {
  background: rgb(209 213 219);
  border-radius: 4px;
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb:hover {
  background: rgb(156 163 175);
}

.dark .markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb {
  background: rgb(75 85 99);
}

.dark .markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb:hover {
  background: rgb(107 114 128);
}

.dark .markdown-body :deep(pre.shiki) {
  border-color: rgb(55 65 81);
}

/* Shiki 双主题切换 - 使用 CSS 变量 */
/* 暗色模式下应用暗色主题的 CSS 变量 */
.dark .markdown-body :deep(pre.shiki),
.dark .markdown-body :deep(pre.shiki span),
.dark .markdown-body :deep(pre.shiki code),
.dark .markdown-body :deep(pre.shiki .line) {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}

/* 暗色模式下行号颜色 */
.dark .markdown-body :deep(pre.shiki code .line::before) {
  color: var(--shiki-dark) !important;
  opacity: 0.5;
}

/* 代码块折叠 - 只显示前14行 */
.markdown-body :deep(pre.shiki.code-collapsed) {
  max-height: calc(1.8em * 12 + 32px);
  overflow: hidden;
}

.markdown-body :deep(pre.shiki.code-collapsed > code) {
  overflow: hidden;
}

.markdown-body :deep(pre.shiki.code-collapsed .code-expand-button) {
  position: absolute;
  inset: auto 0 0;
  z-index: 3;
  width: 100%;
  padding: 18px 8px 8px;
  text-align: center;
  font-family: "Noto Serif SC", serif;
  font-size: 12px;
  line-height: 1;
  color: rgb(107 114 128);
  background: linear-gradient(transparent, rgb(255 255 255));
  border: none;
  cursor: pointer;
}

.dark .markdown-body :deep(pre.shiki.code-collapsed .code-expand-button) {
  background: linear-gradient(transparent, rgb(17 24 39));
  color: rgb(156 163 175);
}

/* 代码行号 - 通过 CSS 计数器生成 */
.markdown-body :deep(pre.shiki > code) {
  counter-reset: line;
}

.markdown-body :deep(pre.shiki code .line) {
  display: block;
  position: relative;
  padding-left: 40px;
  line-height: 1.6;
  min-height: 22.4px;
}

.markdown-body :deep(pre.shiki code .line::before) {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: 2em;
  margin-right: 1em;
  text-align: right;
  color: rgb(156 163 175);
  opacity: 0.5;
  /* font-size: 0.85em; */
  user-select: none;
  position: absolute;
  left: -1px;
}

.dark .markdown-body :deep(pre.shiki code .line::before) {
  color: rgb(107 114 128);
}

/* [!code highlight] / [!code hl] 高亮行 */
.markdown-body :deep(pre.shiki .line.highlighted) {
  background-color: rgb(241 200 80 / 0.16);
}

/* [!code ++] 新增行 / [!code --] 删除行 */
.markdown-body :deep(pre.shiki .line.diff.add) {
  background-color: rgb(46 160 67 / 0.14);
}

.markdown-body :deep(pre.shiki .line.diff.remove) {
  background-color: rgb(248 81 73 / 0.14);
}

/* diff 行号前缀：行号数字左侧空白处显示 + / -，不推动数字、不破坏代码列对齐 */
.markdown-body :deep(pre.shiki .line.diff.add::after) {
  content: "+";
  position: absolute;
  left: 4px;
  top: 0;
  color: rgb(46 160 67);
}

.markdown-body :deep(pre.shiki .line.diff.remove::after) {
  content: "-";
  position: absolute;
  left: 4px;
  top: 0;
  color: rgb(248 81 73);
}

/* 暗色模式：!important 覆盖 .line 的 --shiki-dark-bg !important 背景 */
.dark .markdown-body :deep(pre.shiki .line.highlighted) {
  background-color: rgb(237 197 80 / 0.2) !important;
}

.dark .markdown-body :deep(pre.shiki .line.diff.add) {
  background-color: rgb(63 185 80 / 0.2) !important;
}

.dark .markdown-body :deep(pre.shiki .line.diff.remove) {
  background-color: rgb(248 81 73 / 0.24) !important;
}

.dark .markdown-body :deep(pre.shiki .line.diff.add::after) {
  color: rgb(74 222 128);
}

.dark .markdown-body :deep(pre.shiki .line.diff.remove::after) {
  color: rgb(248 113 113);
}

/* 代码复制按钮 */
.markdown-body :deep(pre.shiki .lang-label) {
  position: absolute;
  top: 8px;
  right: 36px;
  max-width: 96px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgb(243 244 246);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  color: rgb(107 114 128);
  opacity: 0.72;
  transition: opacity 0.2s;
  pointer-events: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 文件名标签 - 右上角显示 */
.markdown-body :deep(pre.shiki.has-file-name .file-label) {
  position: absolute;
  top: 6px;
  right: 36px;
  left: auto;
  background: white;
  padding: 4px 12px 0 12px;
  border-radius: 6px 6px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: rgb(55 65 81);
  z-index: 2;
  opacity: 1;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.markdown-body :deep(pre.shiki:hover .lang-label) {
  opacity: 1;
}

.dark .markdown-body :deep(pre.shiki .lang-label) {
  background: rgb(55 65 81);
  color: rgb(156 163 175);
}

.markdown-body :deep(pre.shiki .copy-button) {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
  color: rgb(107 114 128);
}

.markdown-body :deep(pre.shiki:hover .copy-button),
.markdown-body :deep(pre.shiki.has-file-name:hover .file-label) {
  opacity: 1;
}

.markdown-body :deep(pre.shiki .copy-button:hover) {
  opacity: 1;
  color: rgb(37 99 235);
}

/* 复制成功状态 */
.markdown-body :deep(pre.shiki .copy-button.copied) {
  opacity: 1;
  color: rgb(34 197 94);
}

.dark .markdown-body :deep(pre.shiki .copy-button) {
  color: rgb(156 163 175);
}

.dark .markdown-body :deep(pre.shiki .copy-button:hover) {
  color: rgb(96 165 250);
}

.dark .markdown-body :deep(pre.shiki .copy-button.copied) {
  color: rgb(74 222 128);
}

.dark .markdown-body :deep(pre.shiki.has-file-name::before) {
  background: rgb(31 41 55);
  border-bottom-color: rgb(55 65 81);
}

/* 文件名标签样式 - 右上角显示，复用语言标签的样式规格 */
.markdown-body :deep(pre.shiki.has-file-name .file-label) {
  position: absolute;
  top: 6px;
  right: 36px;
  left: auto;
  background: rgb(243 244 246);
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  color: rgb(107 114 128);
  opacity: 0.72;
  transition: opacity 0.2s;
  pointer-events: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 添加文件图标（仅 has-icon 时渲染，图标 URL 由 JS 通过 --icon-url 传入） */
.markdown-body :deep(pre.shiki .file-label.has-icon::before) {
  content: "";
  display: inline-block;
  width: 12px;
  height: 12px;
  background-image: var(--icon-url);
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
  border-radius: 2px;
}

.dark .markdown-body :deep(pre.shiki.has-file-name .file-label) {
  background: rgb(55 65 81);
  color: rgb(229 231 235);
}

/* 复制按钮位置调整 - 在带文件名的代码块中 */
.markdown-body :deep(pre.shiki.has-file-name .copy-button) {
  top: 6px;
  right: 8px;
}

/* 带文件名的代码块中隐藏语言标签 - 语言信息已经包含在文件名标题里了 */
.markdown-body :deep(pre.shiki.has-file-name .lang-label) {
  display: none;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
}

.markdown-body :deep(table th),
.markdown-body :deep(table td) {
  padding: 0.5em 1em;
  border: 1px solid rgb(229 231 235);
}

.dark .markdown-body :deep(table th),
.dark .markdown-body :deep(table td) {
  border-color: rgb(55 65 81);
}

.markdown-body :deep(table th) {
  background: rgb(249 250 251);
  font-weight: 600;
}

.dark .markdown-body :deep(table th) {
  background: rgb(31 41 55);
}

.markdown-body :deep(hr) {
  margin: 2em 0;
  border: none;
  border-top: 1px solid rgb(229 231 235);
}

.dark .markdown-body :deep(hr) {
  border-top-color: rgb(55 65 81);
}

/* 响应式 */
@media (max-width: 768px) {
  .text-\[3em\] {
    font-size: 2em;
  }
}
</style>
