<script setup lang="ts">
import "@/assets/css/fancybox.css";
import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import { Fancybox } from "@fancyapps/ui";
import Swiper from "swiper";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { Mousewheel, Navigation, Pagination } from "swiper/modules";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const route = useRoute();
const categorySlug = route.params.category as string;
const slug = route.params.slug as string;

// 从 URL 获取分类信息
const { data: categoryData } = await useFetch(`/api/category/${categorySlug}`);
const categoryFromUrl = computed(() => categoryData.value?.data || null);

// 格式化日期
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
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
const { data, pending, error } = await useFetch(`/api/posts/${categorySlug}/${slug}`);

const post = computed(() => data.value?.data);

// 判断文章是否存在
const isNotFound = computed(() => !pending.value && (!post.value || error.value));

const categories = computed(() => post.value?.postrelation?.map(r => r.metas) || []);
const covers = computed(() => post.value?.parsedCovers || []);
const tags = computed(() => post.value?.tags || []);

// 判断封面类型
const hasCover = computed(() => covers.value.length > 0);
const hasManyCovers = computed(() => post.value?.many_covers && covers.value.length > 1);

const contentBody = ref<HTMLElement | null>(null);
const firstCover = computed(() => covers.value[0]?.url || "");

const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");
const commentEnabled = computed(() => siteData.value?.data?.commentEnabled ?? true);

// 用户登录状态
const isLoggedIn = ref(false);
const isLoadingAuth = ref(true);

// 判断是否为图片分类
const photoCategorySlug = computed(() => siteData.value?.data?.photoCategorySlug || "shot");
const isPhotoCategory = computed(() => categorySlug === photoCategorySlug.value);

// 获取相关文章（使用最新文章作为相关文章）
const { data: relatedPostsData, pending: relatedPostsPending } = await useFetch(`/api/recent-posts`, {
  params: {
    limit: 4,
  },
});

const relatedPosts = computed(() => {
  if (!relatedPostsData.value?.success || !post.value) return [];
  return relatedPostsData.value.data.filter((p: any) => p.cid !== post.value?.cid).slice(0, 4);
});

// 目录相关
interface TocItem {
  id: string;
  text: string;
  level: number;
}

const tocItems = ref<TocItem[]>([]);
const activeTocId = ref("");

// 根据文章的 show_toc 字段和实际标题数量决定是否显示目录
const showToc = computed(() => {
  return post.value?.show_toc && tocItems.value.length > 0;
});

// 提取目录
const extractToc = () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  const contentBody = document.querySelector(".content-body");
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
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

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
    const headerOffset = 100;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

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
    const headings = document.querySelectorAll(".content-body h2, .content-body h3");
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
  [post, isNotFound],
  ([newPost, notFound]) => {
    if (notFound) {
      pageTitle.value = `页面未找到 - ${siteName.value}`;
    } else if (newPost?.title) {
      pageTitle.value = `${newPost.title} - ${siteName.value}`;
    }
  },
  { immediate: true },
);

// SEO 元数据
const seoMeta = computed(() => {
  if (!post.value) return {};

  const fullUrl = process.client ? window.location.href : `https://imqi1.qi1.website${route.path}`;

  const keywords = tags.value.map(tag => (typeof tag === "string" ? tag : tag.name)).join(", ");
  const description = post.value.desc || post.value.excerpt || "";
  const coverImage = firstCover.value || "";
  const authorName = post.value.user?.nickname || post.value.user?.name || "ImQi1";
  const publishDate = post.value.create_time || post.value.update_time;
  const modifyDate = post.value.update_time;

  return {
    title: pageTitle.value,
    meta: [
      // 基础元信息
      { name: "description", content: description },
      { name: "keywords", content: keywords },
      { name: "author", content: authorName },

      // Open Graph
      { property: "og:type", content: "article" },
      { property: "og:title", content: post.value.title },
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
        content: typeof tag === "string" ? tag : tag.name,
      })),

      // Twitter Card
      { name: "twitter:card", content: coverImage ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: post.value.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: coverImage },
      { name: "twitter:site", content: "@imqi1" },

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
  () => post.value,
  newPost => {
    // 设置页面标题供导航栏使用
    if (newPost?.title) {
      const { setPageTitle, setPageCategory } = usePageTitle();
      setPageTitle(newPost.title, "ri:file-edit-line");

      // 设置分类信息（从 URL 查询的分类信息中获取）
      if (categoryFromUrl.value) {
        setPageCategory({
          name: categoryFromUrl.value.name,
          slug: categoryFromUrl.value.slug,
        });
      }
    }

    // 只在客户端执行
    if (import.meta.client && newPost) {
      // 使用 setTimeout 确保 DOM 完全渲染
      setTimeout(() => {
        const article = document.querySelector("article.animate-fade-in");
        if (!article) return;

        const header = article.querySelector("header.article-cover");
        const contentBody = article.querySelector(".content-body");
        const metaLicenseBox = article.querySelector(".meta-license-box");
        const commentSection = article.querySelector("section.opacity-0");

        header?.classList.remove("opacity-0", "translate-y-8");
        header?.classList.add("opacity-100", "translate-y-0");
        contentBody?.classList.remove("opacity-0", "translate-y-8");
        contentBody?.classList.add("opacity-100", "translate-y-0");
        metaLicenseBox?.classList.remove("opacity-0", "translate-y-8");
        metaLicenseBox?.classList.add("opacity-100", "translate-y-0");
        commentSection?.classList.remove("opacity-0", "translate-y-8");
        commentSection?.classList.add("opacity-100", "translate-y-0");
      }, 100);
    }
  },
  { immediate: true },
);

// 监听 404 状态，触发错误页动画
watch(isNotFound, () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  if (isNotFound.value) {
    nextTick(() => {
      const notFound = document.querySelector(".not-found-fade-in");
      if (notFound) {
        notFound.classList.add("fade-in-start");
      }
    });
  }
});

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

// 检查用户登录状态
const checkAuthStatus = async () => {
  if (import.meta.client) {
    try {
      const res = await $fetch('/api/auth/verify');
      isLoggedIn.value = (res as any).valid || false;
    } catch {
      isLoggedIn.value = false;
    } finally {
      isLoadingAuth.value = false;
    }
  }
};

// 初始化 Fancybox 和其他功能
onMounted(() => {
  // 检查登录状态
  checkAuthStatus();
  try {
    // 404 页面动画（初始状态）
    if (isNotFound.value) {
      nextTick(() => {
        const notFound = document.querySelector(".not-found-fade-in");
        if (notFound) {
          notFound.classList.add("fade-in-start");
        }
      });
    }

    // 初始化 Fancybox（参照友情链接页面）
    // @ts-ignore
    Fancybox.bind("[data-fancybox]", {
      l10n: zh_CN,
      placeFocusBack: false,
      Hash: false,
      trapFocus: false,
      closeExisting: false,
      zoomEffect: true,
      Carousel: {
        Panzoom: {
          maxScale: 2,
        },
        Toolbar: {
          display: {
            left: ["infobar"],
            middle: ["zoomIn", "zoomOut", "toggle1to1"],
            right: ["thumbs", "close"],
          },
        },
        Autoplay: false,
      },
      idle: false,
      autoFocus: false,
    });

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
          if (fullLang.includes("+")) {
            const parts = fullLang.split("+");
            lang = parts[0];
            fileName = parts.slice(1).join("+"); // 支持文件名中包含+的情况
            pre.classList.add("has-file-name");
          } else {
            lang = fullLang;
          }
        }
      }

      // 语言显示名称映射
      const langNames: Record<string, string> = {
        js: "JavaScript",
        ts: "TypeScript",
        jsx: "JSX",
        tsx: "TSX",
        vue: "Vue",
        py: "Python",
        rb: "Ruby",
        go: "Go",
        rs: "Rust",
        java: "Java",
        kt: "Kotlin",
        swift: "Swift",
        scala: "Scala",
        cpp: "C++",
        c: "C",
        cs: "C#",
        php: "PHP",
        sql: "SQL",
        sh: "Shell",
        bash: "Bash",
        yaml: "YAML",
        yml: "YAML",
        json: "JSON",
        toml: "TOML",
        xml: "XML",
        html: "HTML",
        css: "CSS",
        scss: "SCSS",
        less: "Less",
        md: "Markdown",
        mermaid: "Mermaid",
      };

      // 如果有文件名，使用文件名作为显示文本；否则使用语言名称
      const displayLang = fileName || langNames[lang] || lang.toUpperCase();

      // 检测代码行数，超过14行则折叠
      const lineCount = code?.querySelectorAll(".line").length || 0;
      const isCollapsed = lineCount > 14;

      if (isCollapsed) {
        pre.classList.add("code-collapsed");

        const handler = e => {
          const target = e.target as HTMLElement;
          // 不处理复制按钮的点击
          if (target.closest(".copy-button")) return;

          pre.classList.toggle("code-collapsed");

          pre.removeEventListener("click", handler);
        };

        // 点击代码块切换折叠状态
        pre.addEventListener("click", handler);
      }

      // 创建语言标签
      const langLabel = document.createElement("span");
      langLabel.className = "lang-label";
      langLabel.textContent = displayLang;

      // 如果有文件名，添加 data-file 属性用于样式匹配
      if (fileName) {
        langLabel.setAttribute("data-file", fileName);
      }

      // 创建复制按钮
      const button = document.createElement("button");
      button.className = "copy-button";
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
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
      pre.appendChild(langLabel);
      pre.appendChild(button);
    });

    // 初始化目录
    nextTick(() => {
      extractToc();
      window.addEventListener("scroll", handleTocScroll);

      // 初始化折叠容器
      const wrappers = document.querySelectorAll(".markdown-details-wrapper");
      wrappers.forEach(wrapper => {
        const summary = wrapper.getAttribute("data-summary") || "展开";
        const content = wrapper.innerHTML;

        // 创建新的容器元素
        const detailsContainer = document.createElement("div");
        detailsContainer.className = "markdown-details-container";
        detailsContainer.innerHTML = `
        <div class="markdown-details my-4 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <button
            class="markdown-details-summary w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <span class="font-medium text-slate-900 dark:text-slate-100">${summary}</span>
            <span class="transform transition-transform duration-200 text-slate-500 dark:text-slate-400 text-[10px]">
              ▼
            </span>
          </button>
          <div class="markdown-details-content px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 hidden">
            ${content}
          </div>
        </div>
      `;

        // 替换原容器
        wrapper.replaceWith(detailsContainer);

        // 添加点击事件
        const button = detailsContainer.querySelector(".markdown-details-summary");
        const contentDiv = detailsContainer.querySelector(".markdown-details-content");
        const arrow = button?.querySelector(".transform");

        button?.addEventListener("click", () => {
          const isHidden = contentDiv?.classList.contains("hidden");
          if (isHidden) {
            contentDiv?.classList.remove("hidden");
            arrow?.classList.add("rotate-180");
          } else {
            contentDiv?.classList.add("hidden");
            arrow?.classList.remove("rotate-180");
          }
        });
      });

      // 初始化视频容器
      const videoWrappers = document.querySelectorAll(".markdown-video-wrapper");
      videoWrappers.forEach(wrapper => {
        const url = wrapper.getAttribute("data-url") || "";

        // 创建 video 元素
        const videoContainer = document.createElement("div");
        videoContainer.className = "markdown-video-container my-6 w-fit m-auto";
        videoContainer.innerHTML = `
        <video
          class="w-full rounded-lg shadow-lg max-h-150"
          controls
          preload="metadata">
          <source src="${url}" type="video/mp4">
          您的浏览器不支持视频播放。
        </video>
      `;

        // 替换原容器
        wrapper.replaceWith(videoContainer);
      });

      // 初始化提示框容器
      const calloutWrappers = document.querySelectorAll(".markdown-callout-wrapper");
      calloutWrappers.forEach(wrapper => {
        const type = wrapper.getAttribute("data-type") || "info";
        const content = wrapper.innerHTML;

        // 根据类型定义样式和图标
        const typeConfig = {
          success: {
            bgColor: "bg-green-50 dark:bg-green-900/20",
            borderColor: "border-green-200 dark:border-green-800",
            textColor: "text-green-900 dark:text-green-100",
            iconColor: "text-green-600 dark:text-green-400",
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
          },
          warning: {
            bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
            borderColor: "border-yellow-200 dark:border-yellow-800",
            textColor: "text-yellow-900 dark:text-yellow-100",
            iconColor: "text-yellow-600 dark:text-yellow-400",
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
          },
          error: {
            bgColor: "bg-red-50 dark:bg-red-900/20",
            borderColor: "border-red-200 dark:border-red-800",
            textColor: "text-red-900 dark:text-red-100",
            iconColor: "text-red-600 dark:text-red-400",
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
          },
          info: {
            bgColor: "bg-blue-50 dark:bg-blue-900/20",
            borderColor: "border-blue-200 dark:border-blue-800",
            textColor: "text-blue-900 dark:text-blue-100",
            iconColor: "text-blue-600 dark:text-blue-400",
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
          },
        };

        const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.info;

        // 创建提示框元素
        const calloutContainer = document.createElement("div");
        calloutContainer.className = `markdown-callout my-4 p-4 rounded-lg border ${config.bgColor} ${config.borderColor}`;
        calloutContainer.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="${config.iconColor} flex-shrink-0 mt-0.5">
            ${config.icon}
          </div>
          <div class="flex-1 ${config.textColor}">
            ${content}
          </div>
        </div>
      `;

        // 替换原容器
        wrapper.replaceWith(calloutContainer);
      });

      // 初始化卡片容器
      const cardWrappers = document.querySelectorAll(".markdown-card-wrapper");
      cardWrappers.forEach(wrapper => {
        const paramsStr = decodeURIComponent(wrapper.getAttribute("data-params") || "");
        // 解析参数：url | title | description | image
        const parts = paramsStr.split("|").map(p => p.trim());

        const url = parts[0] || "";
        const title = parts[1] || "标题";
        const description = parts[2] || "";
        const image = parts[3] || "";

        // 创建卡片元素
        const cardContainer = document.createElement("div");
        cardContainer.className = "markdown-card my-6";

        cardContainer.innerHTML = `
        <a
          href="${url}"
          target="_blank"
          rel="noopener noreferrer"
          class="block group border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-300 bg-white dark:bg-slate-800">
          <div class="flex flex-col md:flex-row">
            ${
              image
                ? `
              <div class="md:w-1/3 h-48 md:h-auto overflow-hidden bg-slate-100 dark:bg-slate-900">
                <img
                  src="${image}"
                  alt="${title}"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            `
                : ""
            }
            <div class="flex-1 p-5 flex flex-col justify-center">
              <div class="flex items-start justify-between gap-3 mb-2">
                <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                  ${title}
                </h3>
                <Icon
                  name="lucide:external-link"
                  class="size-5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5 group-hover:text-blue-500 transition-colors"
                />
              </div>
              ${
                description
                  ? `
                <p class="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                  ${description}
                </p>
              `
                  : ""
              }
              <div class="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
                <Icon name="lucide:link" class="size-3" />
                <span class="truncate max-w-xs">${url}</span>
              </div>
            </div>
          </div>
        </a>
      `;

        // 替换原容器
        wrapper.replaceWith(cardContainer);
      });

      // 初始化轮播图容器
      const swiperWrappers = document.querySelectorAll(".markdown-swiper-wrapper");
      swiperWrappers.forEach((wrapper, wrapperIndex) => {
        // 获取容器的完整文本内容，按行分割
        const fullText = wrapper.textContent || "";
        const lines = fullText
          .split("\n")
          .map(line => line.trim())
          .filter(line => line.length > 0);
        const slides: { url: string; title: string }[] = [];

        // 解析每一行，提取图片 URL 和标题
        lines.forEach(line => {
          const parts = line.split("|").map(s => s.trim());
          if (parts.length >= 1 && parts[0].length > 0) {
            slides.push({
              url: parts[0],
              title: parts[1] || "",
            });
          }
        });

        if (slides.length === 0) {
          wrapper.remove();
          return;
        }

        // 创建唯一的类名和 ID
        const uniqueId = `markdown-swiper-${wrapperIndex}`;
        const uniqueClass = `markdown-swiper-instance-${wrapperIndex}`;

        // 创建轮播图元素
        const swiperContainer = document.createElement("div");
        swiperContainer.className = `swiper-container ${uniqueClass}`;
        swiperContainer.innerHTML = `
        <div class="swiper-wrapper noneed">
          ${slides
            .map(
              (slide, index) => `
            <div class="swiper-slide">
              <img
                src="${slide.url}"
                alt="${slide.title || "图片"}"
                data-fancybox="gallery"
                data-caption="${slide.title || "图片"}"
                class="swiper-img"
                loading="lazy"
              />
              ${slide.title ? `<div class="swiper-slide-title">${slide.title}</div>` : ""}
            </div>
          `,
            )
            .join("")}
        </div>
        <div class="flex justify-between items-center h-8">
          <div class="swiper-pagination"></div>
          <div class="swiper-buttons absolute right-0">
            <div class="swiper-button-prev"></div>
            <div class="swiper-button-next"></div>
          </div>
        </div>
      `;

        // 替换原容器
        wrapper.replaceWith(swiperContainer);

        // 初始化 Swiper
        setTimeout(() => {
          const newSwiper = new Swiper(`.${uniqueClass}`, {
            modules: [Navigation, Pagination, Mousewheel],
            slidesPerView: "auto",
            spaceBetween: 20,
            loop: false,
            mousewheel: {
              forceToAxis: true,
              sensitivity: 1,
              releaseOnEdges: false,
            },
            navigation: {
              nextEl: `.${uniqueClass} .swiper-button-next`,
              prevEl: `.${uniqueClass} .swiper-button-prev`,
            },
            pagination: {
              el: `.${uniqueClass} .swiper-pagination`,
              clickable: true,
            },
            freeMode: false,
            touchRatio: 1,
            resistance: true,
            resistanceRatio: 0.85,
          });
        }, 100);
      });

      // 初始化仓库卡片容器
      const repoWrappers = document.querySelectorAll(".markdown-repo-wrapper");
      repoWrappers.forEach(async wrapper => {
        const url = wrapper.getAttribute("data-url") || "";

        // 解析 URL，判断是 GitHub 还是 Gitee
        let platform: "github" | "gitee" | null = null;
        let owner = "";
        let repo = "";

        if (url.includes("github.com")) {
          platform = "github";
          const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
          if (match) {
            owner = match[1];
            repo = match[2].replace(/\.git$/, "");
          }
        } else if (url.includes("gitee.com")) {
          platform = "gitee";
          const match = url.match(/gitee\.com\/([^/]+)\/([^/]+)/);
          if (match) {
            owner = match[1];
            repo = match[2].replace(/\.git$/, "");
          }
        }

        if (!platform || !owner || !repo) {
          wrapper.innerHTML = `
          <div class="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
            无效的仓库 URL
          </div>
        `;
          return;
        }

        // 显示加载状态
        wrapper.innerHTML = `
        <div class="flex items-center justify-center p-8 border border-slate-200 dark:border-slate-700 rounded-lg">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
          <span class="text-slate-600 dark:text-slate-400">加载仓库信息...</span>
        </div>
      `;

        try {
          let apiUrl = "";
          if (platform === "github") {
            apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
          } else {
            apiUrl = `https://gitee.com/api/v5/repos/${owner}/${repo}`;
          }

          const response = await fetch(apiUrl);
          if (!response.ok) {
            throw new Error("Failed to fetch repo data");
          }

          const data = await response.json();

          // 提取仓库信息
          const repoName = data.full_name || data.name || "";
          const description = data.description || "";
          const language = data.language || "";
          const stars = platform === "github" ? data.stargazers_count : data.stargazers_count;
          const forks = data.forks_count;
          const avatarUrl = platform === "github" ? data.owner?.avatar_url : data.owner?.avatar_url;
          const isPrivate = data.private || false;

          // 创建仓库卡片
          const cardContainer = document.createElement("div");
          cardContainer.className = "markdown-repo my-6";

          const platformIcon =
            platform === "github"
              ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`
              : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.037a.594.594 0 0 1-.592-.593v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z"/></svg>`;

          const platformColor = platform === "github" ? "text-slate-600 dark:text-slate-400" : "text-red-600 dark:text-red-400";

          cardContainer.innerHTML = `
          <a
            href="${url}"
            target="_blank"
            rel="noopener noreferrer"
            class="block group">
            <div class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-300">
              <!-- 顶部栏 -->
              <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <div class="flex items-center gap-2">
                  <span class="${platformColor}">
                    ${platformIcon}
                  </span>
                  <span class="text-xs font-medium text-slate-600 dark:text-slate-400">
                    ${platform === "github" ? "GitHub" : "Gitee"}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  ${
                    isPrivate
                      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          私有
                        </span>`
                      : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="m21 9-9 9-9-9"/><path d="M21 3 9 15l-5-5"/></svg>
                          公开
                        </span>`
                  }
                </div>
              </div>

              <!-- 内容区域 -->
              <div class="p-4">
                <!-- 标题行 -->
                <div class="flex items-start justify-between gap-2 mb-3">
                  <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                    ${repoName}
                  </h3>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-0.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </div>

                <!-- 描述 -->
                ${
                  description
                    ? `
                  <p class="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
                    ${description}
                  </p>
                `
                    : ""
                }

                <!-- 底部信息 -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-4">
                    <div class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      <span class="font-semibold">${stars?.toLocaleString() || 0}</span>
                    </div>
                    <div class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                      <span class="font-semibold">${forks?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    ${
                      language
                        ? `<div class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <span>${language}</span>
                        <span class="size-2 rounded-full ${
                          language === "JavaScript"
                            ? "bg-yellow-400"
                            : language === "TypeScript"
                              ? "bg-blue-500"
                              : language === "Python"
                                ? "bg-green-500"
                                : language === "Java"
                                  ? "bg-red-500"
                                  : language === "Go"
                                    ? "bg-cyan-500"
                                    : language === "Rust"
                                      ? "bg-orange-500"
                                      : language === "C++"
                                        ? "bg-blue-600"
                                        : language === "Vue"
                                          ? "bg-green-400"
                                          : "bg-slate-400"
                        }"></span>
                      </div>`
                        : ""
                    }
                  </div>
                </div>
              </div>
            </div>
          </a>
        `;

          // 替换原容器
          wrapper.replaceWith(cardContainer);
        } catch (error) {
          console.error("Failed to load repo info:", error);
          wrapper.innerHTML = `
          <div class="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
            加载仓库信息失败
          </div>
        `;
        }
      });

      // 初始化音乐播放器容器
      const musicWrappers = document.querySelectorAll(".markdown-music-wrapper");
      musicWrappers.forEach(async wrapper => {
        const paramsStr = decodeURIComponent(wrapper.getAttribute("data-params") || "");
        let server = "netease";
        let type = "playlist";
        let id = "";

        // 解析新的语法格式
        const parts = paramsStr.split(" ").filter(p => p.trim());

        if (parts.length >= 1) {
          if (parts[0] === "auto" && parts.length >= 2) {
            // 格式 1: :::music auto https://example.com:::
            const url = parts[1];
            // 尝试解析 URL 获取平台和 ID
            try {
              const parsedUrl = new URL(url);
              if (parsedUrl.hostname.includes("music.163.com")) {
                server = "netease";
                const typeMatch = parsedUrl.pathname.match(/\/(playlist|song|album|artist)\/?/);
                if (typeMatch) {
                  type = typeMatch[1];
                }
                id = parsedUrl.searchParams.get("id") || "";
              } else if (parsedUrl.hostname.includes("y.qq.com")) {
                server = "tencent";
                const typeMatch = parsedUrl.pathname.match(/\/(playlist|songDetail|albumDetail)\/?/);
                if (typeMatch) {
                  type = typeMatch[1].replace("Detail", "");
                }
                const idMatch = parsedUrl.pathname.match(/\/([^/]+)$/);
                if (idMatch) {
                  id = idMatch[1];
                }
              } else if (parsedUrl.hostname.includes("kuwo.cn")) {
                server = "kuwo";
                const typeMatch = parsedUrl.pathname.match(/\/(playlist|song|album)\/?/);
                if (typeMatch) {
                  type = typeMatch[1];
                }
                const idMatch = parsedUrl.pathname.match(/\/([^/]+)$/);
                if (idMatch) {
                  id = idMatch[1];
                }
              } else if (parsedUrl.hostname.includes("kugou.com")) {
                server = "kugou";
                const typeMatch = parsedUrl.pathname.match(/\/(song|album|playlist)\/?/);
                if (typeMatch) {
                  type = typeMatch[1];
                }
                const idMatch = parsedUrl.pathname.match(/\/([^/]+)\.html$/);
                if (idMatch) {
                  id = idMatch[1];
                }
              } else {
                console.warn("Unsupported music platform:", parsedUrl.hostname);
              }
            } catch (error) {
              console.error("Failed to parse music URL:", error, "URL:", url);
            }
          } else if (parts.length >= 3) {
            // 格式 2: :::music song netease 123456:::
            // 格式 3: :::music playlist netease 123456:::
            type = parts[0];
            server = parts[1];
            id = parts[2];
          } else {
            console.warn("Invalid music params format:", paramsStr);
          }
        }

        // 创建音乐播放器容器
        const musicContainer = document.createElement("div");
        musicContainer.className = "markdown-music my-6";

        // 创建一个唯一的 ID 用于挂载
        const mountId = `meting-player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        musicContainer.innerHTML = `
        <div id="${mountId}" class="meting-player-wrapper">
          <div class="flex items-center justify-center p-8 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
            <span class="text-slate-600 dark:text-slate-400">加载音乐播放器...</span>
          </div>
        </div>
      `;

        // 替换原容器
        wrapper.replaceWith(musicContainer);

        // 动态导入并挂载 MetingPlayer 组件
        try {
          const { MetingPlayer } = await import("~/components/MetingPlayer.vue");
          const { createApp, h } = await import("vue");

          const mountEl = document.getElementById(mountId);
          if (mountEl && id) {
            const app = createApp({
              render: () =>
                h(MetingPlayer, {
                  server: server,
                  type: type,
                  id: id,
                }),
            });

            app.mount(mountEl);
          }
        } catch (error) {
          console.error("Failed to load music player:", error);
          const mountEl = document.getElementById(mountId);
          if (mountEl) {
            mountEl.innerHTML = `
            <div class="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
              加载音乐播放器失败
            </div>
          `;
          }
        }
      });

      // 添加轮播图样式
      const style = document.createElement("style");
      style.textContent = `
      /* Markdown Swiper 样式 - 使用更具体的选择器避免影响其他轮播图 */
      .swiper-container[class*="markdown-swiper-instance"] {
        margin: 0 0 20px;
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

      .swiper-container[class*="markdown-swiper-instance"] .swiper-slide-title {
        text-align: center;
        color: white;
        padding: 8px 12px;
        font-size: 13px;
        line-height: 1.4;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
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
    `;
      document.head.appendChild(style);

      // 初始化实况照片
      const images = document.querySelectorAll(".markdown-body img");
      images.forEach(img => {
        const src = img.src;
        const alt = img.alt;
        const className = img.className;
        const dataFancybox = img.getAttribute("data-fancybox");
        const dataCaption = img.getAttribute("data-caption");

        // 检查是否为实况照片
        const isLive = src.includes("#live") || alt.includes("[live]");

        if (isLive) {
          // 清理URL，移除 #live 标记
          const cleanSrc = src.split("#")[0];

          // 为实况照片创建 LivePhoto 组件
          const livePhotoContainer = document.createElement("div");
          livePhotoContainer.className = "live-photo-container size-full";

          // 使用 LivePhoto 组件的 HTML 结构
          livePhotoContainer.innerHTML = `
            <div class="live-photo-wrapper relative w-full h-auto rounded-lg overflow-hidden ${className}" onmouseenter="this.querySelector('button').classList.add('opacity-100'); this.querySelector('button').classList.remove('opacity-0');" onmouseleave="this.querySelector('button').classList.remove('opacity-100'); this.querySelector('button').classList.add('opacity-0');">
              <!-- 静态图片 -->
              <img
                src="${cleanSrc}"
                alt="${alt}"
                ${dataFancybox ? `data-fancybox="${dataFancybox}"` : ""}
                ${dataCaption ? `data-caption="${dataCaption}"` : ""}
                class="live-photo-image w-full h-full max-h-[inherit] rounded-lg transition-opacity duration-300 ease-in-out object-cover"
                loading="lazy"
              />
              <!-- 视频元素 -->
              <video
                class="live-photo-video absolute w-full inset-0 rounded-lg max-h-[inherit] pointer-events-none transition-opacity duration-300 ease-in-out object-cover"
                playsinline
                muted
                style="opacity: 0"
              ></video>
              <!-- 实况照片标识 -->
              <div class="live-photo-tip absolute top-3 left-3 text-white text-sm flex items-center gap-1 z-10 pointer-events-none">
                <svg data-v-5fc1731c="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--ri size-4" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10M10.622 8.415a.4.4 0 0 0-.622.332v6.506a.4.4 0 0 0 .622.332l4.879-3.252a.4.4 0 0 0 0-.666z"></path></svg>
                <span>实况</span>
              </div>
              <!-- 点击播放模式：播放按钮 -->
              <button
                class="absolute bottom-3 right-3 transition-opacity duration-200 z-20 bg-black/20 dark:bg-black/40 rounded-full backdrop-blur-sm border-none cursor-pointer size-8 flex items-center justify-center opacity-0"
                type="button"
              >
                <svg data-v-5fc1731c="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--ri size-5 text-white drop-shadow-lg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M19.376 12.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832"></path></svg>
              </button>
              <!-- 图片名字 -->
              <div
                class="live-photo-name absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent text-white text-xs text-center opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              >
                ${alt}
              </div>
            </div>
          `;

          // 替换原图片
          img.replaceWith(livePhotoContainer);

          // 添加实况照片的交互逻辑
          const livePhotoWrapper = livePhotoContainer.querySelector(".relative");
          const imgElement = livePhotoWrapper?.querySelector("img");
          const videoElement = livePhotoWrapper?.querySelector("video");
          const playButton = livePhotoWrapper?.querySelector("button");

          if (livePhotoWrapper && imgElement && videoElement) {
            // 提取视频数据
            const extractMotionVideo = async (imgUrl: string): Promise<string | null> => {
              try {
                const res = await fetch(imgUrl, { cache: "force-cache" });
                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                // 查找 MP4 文件的起始标记 "ftyp"
                let start = -1;
                for (let i = 0; i < bytes.length - 8; i++) {
                  if (
                    bytes[i + 4] === 0x66 && // f
                    bytes[i + 5] === 0x74 && // t
                    bytes[i + 6] === 0x79 && // y
                    bytes[i + 7] === 0x70 // p
                  ) {
                    start = i;
                    break;
                  }
                }

                if (start !== -1) {
                  const videoBlob = new Blob([bytes.slice(start)], { type: "video/mp4" });
                  const videoUrl = URL.createObjectURL(videoBlob);
                  return videoUrl;
                }
                return null;
              } catch (error) {
                console.error("提取视频失败:", error);
                return null;
              }
            };

            // 加载视频
            extractMotionVideo(src).then(videoUrl => {
              if (videoUrl) {
                videoElement.src = videoUrl;
                videoElement.load();
              }
            });

            // 播放状态
            let isPlaying = false;
            let imgOpacity = 100;
            let videoOpacity = 0;
            let imgOpacityTimer: number | null = null;
            let videoOpacityTimer: number | null = null;

            // 播放视频
            const playVideo = () => {
              if (!isPlaying && videoElement.src) {
                // 清除所有之前的定时器
                if (imgOpacityTimer !== null) {
                  clearTimeout(imgOpacityTimer);
                  imgOpacityTimer = null;
                }
                if (videoOpacityTimer !== null) {
                  clearTimeout(videoOpacityTimer);
                  videoOpacityTimer = null;
                }

                // 先设置视频到开头
                videoElement.currentTime = 0;

                // 交叉淡入淡出：
                // 1. 先让视频淡入（0 -> 100）
                videoOpacity = 100;
                videoElement.style.opacity = (videoOpacity / 100).toString();

                // 2. 等待一小段时间后，再让图片淡出
                imgOpacityTimer = window.setTimeout(() => {
                  imgOpacity = 0;
                  imgElement.style.opacity = (imgOpacity / 100).toString();
                }, 50); // 50ms 后让图片淡出

                // 3. 开始播放视频
                videoElement.play().catch(error => {
                  console.error("播放视频失败:", error);
                  // 播放失败时恢复显示图片
                  imgOpacity = 100;
                  videoOpacity = 0;
                  imgElement.style.opacity = (imgOpacity / 100).toString();
                  videoElement.style.opacity = (videoOpacity / 100).toString();
                  isPlaying = false;
                });

                isPlaying = true;
                if (playButton) {
                  playButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h2v14H6zm10 0h2v14h-2z"/></svg>`;
                }
              }
            };

            // 暂停视频
            const pauseVideo = () => {
              if (isPlaying) {
                // 清除所有之前的定时器
                if (imgOpacityTimer !== null) {
                  clearTimeout(imgOpacityTimer);
                  imgOpacityTimer = null;
                }
                if (videoOpacityTimer !== null) {
                  clearTimeout(videoOpacityTimer);
                  videoOpacityTimer = null;
                }

                // 交叉淡入淡出：
                // 1. 先让图片淡入（0 -> 100）
                imgOpacity = 100;
                imgElement.style.opacity = (imgOpacity / 100).toString();

                // 2. 等待一小段时间后，再让视频淡出
                videoOpacityTimer = window.setTimeout(() => {
                  videoOpacity = 0;
                  videoElement.style.opacity = (videoOpacity / 100).toString();
                }, 50); // 50ms 后让视频淡出

                // 3. 暂停视频并重置进度
                videoElement.pause();
                videoElement.currentTime = 0;
                isPlaying = false;

                if (playButton) {
                  playButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--ri size-5 text-white drop-shadow-lg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M19.376 12.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832"></path></svg>`;
                }
              }
            };

            // 视频播放结束
            const onVideoEnded = () => {
              // 视频播放结束后自动暂停并显示图片
              if (isPlaying) {
                // 显示图片
                imgOpacity = 100;
                imgElement.style.opacity = (imgOpacity / 100).toString();

                // 等待一小段时间后隐藏视频
                setTimeout(() => {
                  videoOpacity = 0;
                  videoElement.style.opacity = (videoOpacity / 100).toString();
                }, 25);

                // 更新播放状态
                isPlaying = false;

                if (playButton) {
                  playButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--ri size-5 text-white drop-shadow-lg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M19.376 12.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832"></path></svg>`;
                }
              }
            };

            // 视频播放结束时暂停
            videoElement.addEventListener("ended", onVideoEnded);

            // 点击播放/暂停
            if (playButton) {
              playButton.addEventListener("click", e => {
                e.stopPropagation();
                if (isPlaying) {
                  pauseVideo();
                } else {
                  playVideo();
                }
              });
            }
          }
        } else {
          // 普通照片，添加名字显示
          const livePhotoContainer = document.createElement("div");
          livePhotoContainer.className = "live-photo-container w-full h-full";

          livePhotoContainer.innerHTML = `
            <div class="live-photo-wrapper relative w-full h-auto overflow-hidden ${className}">
              <img src="${src}" alt="${alt}" ${dataFancybox ? `data-fancybox="${dataFancybox}"` : ""} ${dataCaption ? `data-caption="${dataCaption}"` : ""} class="w-full h-full object-cover" />
              <div class="live-photo-name absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent text-white text-xs text-center opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                ${alt}
              </div>
            </div>
          `;

          // 替换原图片
          img.replaceWith(livePhotoContainer);
        }
      });
    });
  } catch (error) {
    console.error("页面功能初始化失败:", error);
  }
});

// 清理 Fancybox 和滚动监听
onUnmounted(() => {
  Fancybox.destroy();
  window.removeEventListener("scroll", handleTocScroll);
});
</script>

<template>
  <div
    :class="[
      'mx-auto w-full',
      isPhotoCategory ? (showToc ? 'max-w-[93.75rem]' : 'max-w-[87.5rem]') : showToc ? 'max-w-[62.5rem]' : 'max-w-[56.25rem]',
    ]">
    <div v-if="pending" class="py-20 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载中...</p>
    </div>

    <div
      v-else-if="isNotFound"
      class="text-center flex items-center justify-center flex-col place-self-center justify-self-center size-full not-found-fade-in">
      <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3 text-gray-900 dark:text-gray-100">
        <Icon name="ri:close-large-fill" class="text-red-500" />
        <span>页面未找到</span>
      </h1>

      <p class="text-lg text-slate-600 dark:text-slate-400 mb-8">
        未找到内容，你可以
        <NuxtLink to="/" class="text-blue-600 hover:underline font-medium"> 返回首页 </NuxtLink>
        。
      </p>
    </div>

    <article v-else class="flex flex-col w-full animate-fade-in">
      <!-- 标题区域 -->
      <header :class="['opacity-0 translate-y-8 duration-300 ease-out', !hasCover ? 'flex flex-col items-center' : '']" class="article-cover">
        <!-- 多封面轮播 -->
        <CoverSwiper v-if="hasManyCovers" :covers="covers" :is-photo-category="isPhotoCategory" />

        <!-- 单封面 -->
        <LivePhoto
          v-else-if="hasCover"
          :src="firstCover"
          alt="封面"
          :hover-play="false"
          data-fancybox="gallery"
          :data-caption="covers[0]?.desc || '封面'"
          :class="[
            'w-full h-full object-cover border border-gray-200 dark:border-gray-800 mb-5 cursor-zoom-in',
            isPhotoCategory ? 'max-h-[600px]' : 'max-h-37.5',
          ]"
          loading="lazy" />

        <!-- 标题 -->
        <h1 id="article-title" class="text-[3em] font-extrabold leading-tight mb-2.5 text-slate-900 dark:text-slate-100 break-words">
          {{ post.title }}
        </h1>

        <!-- 描述/摘要 -->
        <div class="mb-5">
          <div v-if="post.desc" class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {{ post.desc }}
          </div>
          <!-- 编辑按钮（仅登录时显示） -->
          <ClientOnly>
            <a
              v-if="isLoggedIn && !isLoadingAuth"
              :href="`/admin/posts/edit?cid=${post.cid}`"
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
        <aside v-if="showToc" class="toc-sidebar hidden lg:block max-w-48 flex-shrink-0 order-first w-fit">
          <nav class="toc-nav sticky top-24 w-fit">
            <h3 class="px-2 text-sm font-medium text-slate-900 dark:text-slate-100 mb-3 w-fit max-w-full">目录</h3>
            <ul class="space-y-1 w-fit max-w-48">
              <li v-for="item in tocItems" :key="item.id" class="max-w-48 wrap-anywhere overflow-hidden text-ellipsis">
                <button
                  @click="scrollToHeading(item.id)"
                  :class="[
                    'block text-sm py-1 px-2 rounded transition-colors no-underline text-left',
                    item.level === 3 ? 'pl-4' : '',
                    activeTocId === item.id
                      ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
                  ]">
                  {{ item.text }}
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <!-- 文章正文 -->
        <div
          ref="contentBody"
          class="min-w-0 w-full opacity-0 translate-y-8 duration-300 ease-out markdown-body content-body"
          v-html="post.renderedContent"></div>
      </div>

      <!-- 元信息盒子和 CC 授权 -->
      <div class="mt-4 p-4 borde rounded-lg w-full opacity-0 translate-y-8 duration-300 ease-out meta-license-box">
        <!-- 元信息 -->
        <div class="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span class="inline-flex items-center gap-0.5" v-tooltip="'作者'">
            <Icon name="ri:user-line" class="size-4" />
            <span>{{ post.user?.nickname || post.user?.name || "匿名" }}</span>
          </span>
          <span class="inline-flex items-center gap-0.5" v-tooltip="'发布时间'">
            <Icon name="ri:edit-2-line" class="size-4" />
            <time :datetime="post.update_time">
              {{ formatDate(post.update_time) }}
            </time>
          </span>
          <span v-if="categories.length > 0" class="inline-flex items-center gap-0.5" v-tooltip="'分类'">
            <Icon name="ri:menu-line" class="size-4" />
            <NuxtLink
              v-for="(cat, index) in categories"
              :key="cat.mid"
              :to="`/category/${cat.slug}`"
              class="text-inherit no-underline transition-colors hover:text-blue-600">
              {{ cat.name }}{{ index < categories.length - 1 ? ", " : "" }}
            </NuxtLink>
          </span>
          <span v-if="tags.length > 0" class="inline-flex items-center gap-0.5" v-tooltip="'标签'">
            <Icon name="ri:hashtag" class="size-4" />
            <NuxtLink
              v-for="(tag, index) in tags"
              :key="index"
              :to="tag.slug ? `/tag/${tag.slug}` : '#'"
              :class="[
                'hover:text-blue-600 dark:hover:text-blue-500 transition-colors mr-2',
                tag.slug ? 'cursor-pointer' : 'cursor-default opacity-50',
              ]">
              {{ typeof tag === "string" ? tag : tag.name }}
            </NuxtLink>
          </span>
        </div>

        <!-- CC 协议授权 -->
        <div class="mt-4 pt-4 border-t border-gray-300 dark:border-gray-700">
          <div class="cc-license flex items-center gap-1">
            <Icon name="ri:copyright-line" class="text-xs text-slate-600 dark:text-slate-400"></Icon>
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
      </div>

      <!-- 相关文章 -->
      <section v-if="relatedPosts.length > 0" class="w-full opacity-0 translate-y-8 duration-300 ease-out content-constrained">
        <h3 class="text-xl font-semibold my-4 text-slate-900 dark:text-slate-100 h-max">相关文章</h3>
        <div class="flex flex-wrap gap-4">
          <div
            v-for="relatedPost in relatedPosts"
            :key="relatedPost.cid"
            class="flex-1 min-w-50 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden transition-transform hover:border-blue-400 min-h-50">
            <NuxtLink :to="`/content/${relatedPost.categories[0]?.slug || 'uncategorized'}/${relatedPost.slug}`" class="flex flex-col">
              <div v-if="relatedPost.covers && relatedPost.covers.length > 0" class="overflow-hidden">
                <img
                  :src="relatedPost.covers[0]?.url"
                  :alt="relatedPost.title"
                  class="w-full h-30 object-cover transition-transform duration-300 hover:scale-105"
                  loading="lazy" />
              </div>
              <div v-else class="flex h-30 items-center justify-center bg-gray-200 dark:bg-gray-800">
                <span class="text-4xl font-bold text-gray-400 dark:text-gray-600">{{ relatedPost.title ? relatedPost.title.charAt(0) : "?" }}</span>
              </div>
              <div class="px-4 py-2">
                <h4 class="font-medium text-slate-900 dark:text-slate-100 mb-1 line-clamp-1">{{ relatedPost.title }}</h4>
                <p class="text-sm text-slate-600 dark:text-slate-400 line-clamp-1">{{ relatedPost.desc || "暂无描述" }}</p>
                <div class="mt-1 text-xs text-slate-500 dark:text-slate-500">
                  {{ formatDate(relatedPost.created) }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- 评论区 -->
      <section v-if="commentEnabled" class="w-full duration-300 ease-out animate-fade-in content-constrained">
        <CommentList :post-id="post.cid" :load-all-comments="!!route.hash && route.hash.startsWith('#comment-')" />
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

/* 404 页面淡入动画 */
.not-found-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.not-found-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
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

.live-photo-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  pointer-events: none;
}

.content-constrained {
  max-width: 56.25rem; /* 900px - same as max-w-225 */
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

/* 目录样式 */
.toc-sidebar {
  position: relative;
  opacity: 0;
  transform: translateX(-20px);
  animation: toc-slide-in 0.5s ease-out forwards;
  animation-delay: 0.3s;
}

@keyframes toc-slide-in {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.toc-nav {
  max-height: calc(100vh - 120px);
  overflow-y: auto;
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
  margin-top: 1.5em;
}

/* 图片容器 */
.markdown-body :deep(.markdown-figure) {
  margin: 20px 0;
  text-align: center;
}

.markdown-body :deep(.markdown-figure img) {
  margin: auto;
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

.markdown-body :deep(img:not(.swiper-container img)) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 20px 0;
  cursor: zoom-in;
  max-height: 600px;
  margin: auto;
}

.markdown-body :deep(p:not(.markdown-callout p):not(.markdown-card p):not(.swiper-slide-title p):not(.markdown-repo p):not(blockquote p)) {
  margin: 1em 0;
  text-indent: 2em;
}

.markdown-body :deep(h1):not(.markdown-callout h1):not(.markdown-card h1):not(.swiper-slide-title h1):not(.markdown-repo h1),
.markdown-body :deep(h2):not(.markdown-callout h2):not(.markdown-card h2):not(.swiper-slide-title h2):not(.markdown-repo h2),
.markdown-body :deep(h3):not(.markdown-callout h3):not(.markdown-card h3):not(.swiper-slide-title h3):not(.markdown-repo h3),
.markdown-body :deep(h4):not(.markdown-callout h4):not(.markdown-card h4):not(.swiper-slide-title h4):not(.markdown-repo h4),
.markdown-body :deep(h5):not(.markdown-callout h5):not(.markdown-card h5):not(.swiper-slide-title h5):not(.markdown-repo h5),
.markdown-body :deep(h6):not(.markdown-callout h6):not(.markdown-card h6):not(.swiper-slide-title h6):not(.markdown-repo h6) {
  margin-bottom: 0.5em;
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

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.dark .markdown-body :deep(a) {
  color: rgb(96 165 250);
}

.markdown-body :deep(ul):not(.markdown-callout ul):not(.markdown-card ul):not(.markdown-repo ul):not(.aplayer-list ul),
.markdown-body :deep(ol):not(.markdown-callout ol):not(.markdown-card ol):not(.markdown-repo ol):not(.aplayer-list ol) {
  margin: 1em 0;
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
  margin: 1em 0;
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
  margin: 1em 0;
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
  cursor: pointer;
}

.markdown-body :deep(pre.shiki.code-collapsed > code) {
  overflow: hidden;
}

.markdown-body :deep(pre.shiki.code-collapsed::after) {
  content: "...";
  font-family: "Noto Serif SC", serif;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: rgb(107 114 128);
  background: linear-gradient(transparent, rgb(255 255 255));
  pointer-events: none;
}

.dark .markdown-body :deep(pre.shiki.code-collapsed::after) {
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
  width: 1.5em;
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

/* 代码复制按钮 */
.markdown-body :deep(pre.shiki .lang-label) {
  position: absolute;
  top: 8px;
  right: 36px;
  font-size: 11px;
  font-weight: 500;
  color: rgb(107 114 128);
  opacity: 0.5;
  transition: opacity 0.2s;
  pointer-events: none;
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

.markdown-body :deep(pre.shiki:hover .copy-button) {
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

/* 带文件名的代码块样式 - 编辑器风格 */
.markdown-body :deep(pre.shiki.has-file-name) {
  padding-top: 44px; /* 为文件标签栏留出空间 */
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

/* 文件标签栏容器 */
.markdown-body :deep(pre.shiki.has-file-name::before) {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  background: rgb(243 244 246);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  border-bottom: 1px solid rgb(229 231 235);
  z-index: 1;
}

.dark .markdown-body :deep(pre.shiki.has-file-name::before) {
  background: rgb(31 41 55);
  border-bottom-color: rgb(55 65 81);
}

/* 文件名标签样式 */
.markdown-body :deep(pre.shiki.has-file-name .lang-label) {
  position: absolute;
  top: 6px;
  left: 12px;
  right: auto;
  background: white;
  padding: 4px 12px;
  border-radius: 6px;
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

/* 添加文件图标 */
.markdown-body :deep(pre.shiki.has-file-name .lang-label::before) {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}

/* 不同文件类型的图标 */
.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".js"]::before),
.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".jsx"]::before) {
  background-image: url("/icons/javascript.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".ts"]::before),
.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".tsx"]::before) {
  background-image: url("/icons/typescript.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".vue"]::before) {
  background-image: url("/icons/vue.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".css"]::before),
.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".scss"]::before) {
  background-image: url("/icons/css.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".html"]::before) {
  background-image: url("/icons/html.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".json"]::before) {
  background-image: url("/icons/json.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".md"]::before) {
  background-image: url("/icons/markdown.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".markdown"]::before) {
  background-image: url("/icons/markdown.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".py"]::before) {
  background-image: url("/icons/python.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".php"]::before) {
  background-image: url("/icons/php.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".java"]::before) {
  background-image: url("/icons/java.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".sh"]::before),
.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".bash"]::before) {
  background-image: url("/icons/bash.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".ps1"]::before) {
  background-image: url("/icons/powershell.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".sql"]::before) {
  background-image: url("/icons/sql.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".yaml"]::before),
.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".yml"]::before) {
  background-image: url("/icons/yaml.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".xml"]::before) {
  background-image: url("/icons/xml.svg");
}

.markdown-body :deep(pre.shiki.has-file-name .lang-label[data-file$=".ini"]::before) {
  background-image: url("/icons/ini.svg");
}

/* 没有匹配图标时的默认样式 */
.markdown-body :deep(pre.shiki.has-file-name .lang-label::before) {
  border-radius: 2px;
  background-size: cover;
}

.dark .markdown-body :deep(pre.shiki.has-file-name .lang-label) {
  background: rgb(55 65 81);
  color: rgb(229 231 235);
}

/* 复制按钮位置调整 - 在带文件名的代码块中 */
.markdown-body :deep(pre.shiki.has-file-name .copy-button) {
  top: 38px; /* 移到文件标签栏下方 */
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 1em 0;
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

/* 评论高亮效果 */
:deep(li[id^="comment-"]) {
  transition: all 0.3s ease-in-out;
  border-radius: 0.5rem;
  padding: 0.5rem;
  margin: -0.5rem;
}
</style>
