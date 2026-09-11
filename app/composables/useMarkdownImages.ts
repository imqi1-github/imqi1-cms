import { createVNode, render, type Component } from "vue";

import LivePhoto from "~/components/LivePhoto.vue";
import type { MarkdownImageMountOptions } from "~/types/composables/markdown-images";
import type { NuxtVueApp } from "~/types/nuxt";
import { escapeHtmlAttr } from "~/utils/markdownWidgets";

/**
 * Markdown 图片增强
 *
 * 在文章详情页中，Markdown 渲染出的 <img> 标签需要被增强：
 * - 实况照片（src 含 #live 或 alt 含 [live]）：动态挂载 LivePhoto 组件
 * - 普通图片：包裹一层 wrapper 以显示 caption 浮层
 *
 * 动态挂载采用 createVNode + render 的方式（而非 createApp），
 * 并共享当前 Nuxt 应用的 appContext，确保 @nuxt/icon 注册的全局 <Icon> 组件、
 * Pinia、router 等在动态挂载的 LivePhoto 内可用。
 *
 * 注意：appContext 通过 useNuxtApp().vueApp._context 获取，
 * 这样在 async setup 的 await 之后或 onMounted 回调内部调用 mount() 仍然有效。
 */
export const useMarkdownImages = () => {
  // 记录所有动态挂载的容器，用于卸载时清理
  let mountedContainers: HTMLElement[] = [];

  /**
   * 获取当前 Nuxt 应用的 appContext，用于动态挂载时共享全局组件
   * 用 useNuxtApp().vueApp._context 获取，在 async setup 的 await 之后或
   * onMounted 回调内部调用都能稳定拿到（useNuxtApp 不依赖 inject 同步上下文）
   */
  const getAppContext = () => {
    try {
      // vueApp._context 是 Vue 应用实例的 appContext（公开 API 之外的稳定内部字段）
      return (useNuxtApp().vueApp as NuxtVueApp)._context;
    } catch {
      return undefined;
    }
  };

  /**
   * 增强 markdown-body 内的所有图片
   * @param root 查询根容器，默认为 document
   */
  const mount = (root: ParentNode = document, options: MarkdownImageMountOptions = {}) => {
    // HMR 或重复调用时，先清理旧的挂载
    unmount();

    const appContext = getAppContext();

    const images = root.querySelectorAll<HTMLImageElement>(".markdown-body img");
    images.forEach(imgEl => {
      // 卡片类容器（大链接卡片、简单外链卡片、仓库卡片）内的图片是装饰性图片，
      // 已由各自的模板控制尺寸（如大链接卡片左侧的 size-full object-cover），
      // 不应再套用通用图片增强逻辑，否则会丢失 size-full 导致高度塌陷到图片原始尺寸
      if (imgEl.closest(".markdown-card, .markdown-simple-card, .markdown-repo")) {
        return;
      }

      // 已增强过的图片（同一次渲染里 mount 被重复调用 / HMR 重跑）跳过，避免「套娃」：
      // 普通图已替换成 .markdown-image-container 内的 .markdown-image，实况图已替换成 .live-photo-container
      if (imgEl.closest(".markdown-image-container, .markdown-live-photo-container")) {
        return;
      }

      const src = imgEl.src;
      const alt = imgEl.alt || "";
      const className = imgEl.className || "";
      const dataLightbox = imgEl.getAttribute("data-lightbox");
      const dataCaption = imgEl.getAttribute("data-caption");
      const resolvedDimensions = options.resolveDimensions?.(src);
      const width = imgEl.getAttribute("width") || resolvedDimensions?.width || null;
      const height = imgEl.getAttribute("height") || resolvedDimensions?.height || null;
      const numericWidth = Number(width);
      const numericHeight = Number(height);
      const imageRatio = Number.isFinite(numericWidth) && numericWidth > 0 && Number.isFinite(numericHeight) && numericHeight > 0
        ? numericWidth / numericHeight
        : null;
      const hasAspectRatio = imageRatio !== null;
      const aspectRatio = hasAspectRatio ? `${numericWidth} / ${numericHeight}` : undefined;
      const wrapperStyle = [
        aspectRatio ? `aspect-ratio: ${aspectRatio};` : "",
        imageRatio ? `--markdown-image-ratio: ${imageRatio};` : "",
      ].filter(Boolean).join(" ");

      // 检查是否为实况照片
      const isLive = src.endsWith("#live") || alt.includes("[live]");

      if (isLive) {
        // 兼容 [live] 标记：若仅 alt 含 [live]，给 src 补上 #live 后缀，让 LivePhoto 内部正确识别
        const finalSrc = src.endsWith("#live") ? src : `${src}#live`;

        // 创建挂载容器
        const container = document.createElement("div");
        container.className = "live-photo-container markdown-live-photo-container";
        if (wrapperStyle) {
          container.setAttribute("style", wrapperStyle);
        }

        // 构造 LivePhoto 的 props，过滤掉空 attr 避免渲染成字符串 "null"
        const vnodeProps: Record<string, unknown> = {
          src: finalSrc,
          alt,
          class: className,
          aspectRatio,
          hoverPlay: false, // 详情页内嵌实况照片走点击播放模式
          loading: "lazy",
        };
        if (dataLightbox) vnodeProps["data-lightbox"] = dataLightbox;
        if (dataCaption) vnodeProps["data-caption"] = dataCaption;

        // 替换原 img
        imgEl.replaceWith(container);

        // 创建 vnode 并共享当前应用上下文，确保 <Icon> 等全局组件可解析
        const vnode = createVNode(LivePhoto as Component, vnodeProps);
        vnode.appContext = appContext;
        render(vnode, container);

        mountedContainers.push(container);
      } else {
        // 普通图片：包裹 wrapper 以保留灯箱和比例占位，标题由 markdown-it 的 figcaption 负责
        const wrapper = document.createElement("div");
        wrapper.className = "markdown-image-container";
        wrapper.innerHTML = `
          <div class="markdown-image-wrapper relative overflow-hidden ${escapeHtmlAttr(className)}"${wrapperStyle ? ` style="${escapeHtmlAttr(wrapperStyle)}"` : ""}>
            <img
              src="${escapeHtmlAttr(src)}"
              alt="${escapeHtmlAttr(alt)}"
              decoding="async"
              ${dataLightbox ? `data-lightbox="${escapeHtmlAttr(dataLightbox)}"` : ""}
              ${dataCaption ? `data-caption="${escapeHtmlAttr(dataCaption)}"` : ""}
              class="markdown-image"
            />
          </div>
        `;

        imgEl.replaceWith(wrapper);
      }
    });
  };

  /**
   * 卸载所有动态挂载的 LivePhoto 组件，触发其 onUnmounted（清理 Blob URL、定时器）
   */
  const unmount = () => {
    for (const container of mountedContainers) {
      if (container.parentNode) {
        render(null, container);
      }
    }
    mountedContainers = [];
  };

  return {
    mount,
    unmount,
  };
};
