import type { MarkdownContentOptions } from "~/types/composables/markdown-content";
import { useMarkdownWidgets } from "~/composables/useMarkdownWidgets";
import { useMarkdownImages } from "~/composables/useMarkdownImages";

/**
 * markdown 正文的客户端增强（文章详情页与协议页共用）。
 *
 * 服务端 renderMarkdown 输出 .markdown-body 里的：代码块（复制/折叠展开/语言·文件名标签）、
 * markdown 动态组件（折叠/视频/提示框/卡片/简单外链/轮播/仓库/瀑布流/音乐 + 实况照片）、
 * 图片（#live 实况照片兼容 + caption 浮层）。在 onMounted 调用 mount()，onUnmounted 调用 cleanup()。
 *
 * @param opts.findImageDimensions 图片尺寸解析（文章页用 markdown 附件宽度，独立页可传常量/null）
 */
export function useMarkdownContent(opts: MarkdownContentOptions) {
  let cleanupWidgets: (() => void) | null = null;
  const { mount: mountMarkdownImages, unmount: unmountMarkdownImages } = useMarkdownImages();

  function mount() {
    if (!import.meta.client) return;

    // —— 代码块增强：复制按钮 / 折叠展开按钮 / 语言·文件名标签 ——
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

    // —— 轮播图/瀑布流/实况照片动态组件样式（固定 id：两次挂载间用 id 判存，避免重复 <style>）——
    const style = document.createElement("style");
    style.id = "markdown-widget-styles";
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
    if (!document.getElementById("markdown-widget-styles")) {
      document.head.appendChild(style);
    }

    // —— 实况照片（兼容旧文章中 #live / [live] 图片写法）——
    mountMarkdownImages(document, {
      resolveDimensions: opts.findImageDimensions,
    });

    // —— markdown 动态组件（折叠/视频/提示框/卡片/简单外链/轮播/仓库/瀑布流/音乐 + 实况照片）——
    cleanupWidgets = useMarkdownWidgets(document.body, {
      findImageDimensions: opts.findImageDimensions,
    }).cleanup;
  }

  function cleanup() {
    cleanupWidgets?.();

    // 卸载所有动态挂载的 LivePhoto 组件（触发其 onUnmounted 清理 Blob URL、定时器）
    unmountMarkdownImages();

    // 清理所有代码块的复制按钮 / 折叠 / 实况照片监听器
    document.querySelectorAll(".copy-button").forEach(button => {
      button.replaceWith(button.cloneNode(true));
    });
    document.querySelectorAll("pre[class*='language-']").forEach(pre => {
      pre.replaceWith(pre.cloneNode(true));
    });
    document.querySelectorAll(".markdown-details-summary").forEach(button => {
      button.replaceWith(button.cloneNode(true));
    });
    document.querySelectorAll("video.live-photo-video").forEach(video => {
      video.replaceWith(video.cloneNode(true));
    });
  }

  return { mount, cleanup };
}
