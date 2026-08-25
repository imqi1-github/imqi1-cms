import { createVNode, render, type Component } from "vue";

import LivePhoto from "~/components/LivePhoto.vue";
import MarkdownCallout from "~/components/markdown/MarkdownCallout.vue";
import MarkdownCard from "~/components/markdown/MarkdownCard.vue";
import MarkdownDetails from "~/components/markdown/MarkdownDetails.vue";
import MarkdownMusic from "~/components/markdown/MarkdownMusic.vue";
import MarkdownRepo from "~/components/markdown/MarkdownRepo.vue";
import MarkdownSimpleCard from "~/components/markdown/MarkdownSimpleCard.vue";
import MarkdownSwiper from "~/components/markdown/MarkdownSwiper.vue";
import MarkdownVideo from "~/components/markdown/MarkdownVideo.vue";
import MarkdownWaterfall from "~/components/markdown/MarkdownWaterfall.vue";
import { parseImageLine, safeDecodeURIComponent } from "~/utils/markdownWidgets";

type MarkdownImageDimensions = { width: number | null; height: number | null };
type MarkdownSlide = { url: string; title: string; width: number | null; height: number | null };
type MarkdownWaterfallImage = { url: string; caption: string; width: number | null; height: number | null };

interface UseMarkdownWidgetsOptions {
  /** 由页面提供：基于文章附件元数据解析图片尺寸（markdownImageAttachments）。 */
  findImageDimensions: (url: string) => MarkdownImageDimensions;
}

const METEING_LIVE_PHOTO_PROPS = {
  hoverPlay: false,
  lazy: true,
};

/**
 * markdown 正文里由服务端渲染占位符（.markdown-*-wrapper / .markdown-live-photo-mount），
 * 客户端把每个占位符组件化成对应的 `components/markdown/*` 组件（createVNode + render 挂载）。
 * 返回 cleanup 供 onUnmounted 调用，卸载所有挂载。
 */
export function useMarkdownWidgets(root: HTMLElement, opts: UseMarkdownWidgetsOptions) {
  const appContext = (useNuxtApp().vueApp as { _context: unknown })._context;
  const mounted: HTMLElement[] = [];

  function mount(Component: Component, props: Record<string, unknown>, container: HTMLElement) {
    const vnode = createVNode(Component, props);
    vnode.appContext = appContext as never;
    render(vnode, container);
    mounted.push(container);
  }

  function mountLivePhoto(container: HTMLElement, props: Record<string, unknown>) {
    mount(LivePhoto, props, container);
  }

  // —— 独立 LivePhoto（:::live-photo 直接渲染）——
  document.querySelectorAll<HTMLElement>(".markdown-live-photo-wrapper").forEach(wrapper => {
    const { src, caption } = parseImageLine(safeDecodeURIComponent(wrapper.getAttribute("data-params") || ""));
    if (!src) {
      wrapper.remove();
      return;
    }
    const dimensions = opts.findImageDimensions(src);
    const aspectRatio = dimensions.width && dimensions.height ? `${dimensions.width} / ${dimensions.height}` : undefined;
    const finalSrc = src.includes("#live") ? src : `${src}#live`;
    mountLivePhoto(wrapper, {
      src: finalSrc,
      alt: caption,
      class: "markdown-live-photo w-full max-h-150 rounded-lg",
      aspectRatio,
      ...METEING_LIVE_PHOTO_PROPS,
      "data-fancybox": "gallery",
      "data-caption": caption || "实况照片",
    });
  });

  // —— 折叠详情 ——
  document.querySelectorAll<HTMLElement>(".markdown-details-wrapper").forEach(wrapper => {
    const summary = wrapper.getAttribute("data-summary") || "展开";
    const content = wrapper.innerHTML;
    mount(MarkdownDetails, { summary, content }, wrapper);
  });

  // —— 视频 ——
  document.querySelectorAll<HTMLElement>(".markdown-video-wrapper").forEach(wrapper => {
    mount(MarkdownVideo, { url: wrapper.getAttribute("data-url") || "" }, wrapper);
  });

  // —— 提示框 ——
  document.querySelectorAll<HTMLElement>(".markdown-callout-wrapper").forEach(wrapper => {
    mount(MarkdownCallout, { type: wrapper.getAttribute("data-type") || "info", content: wrapper.innerHTML }, wrapper);
  });

  // —— 外链卡片 ——
  document.querySelectorAll<HTMLElement>(".markdown-card-wrapper").forEach(wrapper => {
    const parts = safeDecodeURIComponent(wrapper.getAttribute("data-params") || "").split("|").map(p => p.trim());
    mount(
      MarkdownCard,
      { url: parts[0] || "", title: parts[1] || "标题", description: parts[2] || "", image: parts[3] || "" },
      wrapper,
    );
  });

  // —— 简单外链卡片 ——
  document.querySelectorAll<HTMLElement>(".markdown-simple-card-wrapper").forEach(wrapper => {
    const parts = safeDecodeURIComponent(wrapper.getAttribute("data-params") || "").split("|").map(p => p.trim());
    mount(MarkdownSimpleCard, { url: parts[0] || "", title: parts[1] || "链接标题" }, wrapper);
  });

  // —— 轮播图（内部含 .markdown-live-photo-mount，稍后统一 hydrate）——
  document.querySelectorAll<HTMLElement>(".markdown-swiper-wrapper").forEach((wrapper, i) => {
    const lines = (wrapper.textContent || "").split("\n").map(l => l.trim()).filter(Boolean);
    const slides: MarkdownSlide[] = [];
    for (const line of lines) {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length >= 1 && parts[0]!.length > 0) {
        const d = opts.findImageDimensions(parts[0]!);
        slides.push({ url: parts[0]!, title: parts[1] || "", width: d.width, height: d.height });
      }
    }
    if (slides.length === 0) {
      wrapper.remove();
      return;
    }
    mount(MarkdownSwiper, { slides, wrapClass: `markdown-swiper-instance-${i}` }, wrapper);
  });

  // —— 仓库卡片 ——
  document.querySelectorAll<HTMLElement>(".markdown-repo-wrapper").forEach(wrapper => {
    mount(MarkdownRepo, { url: wrapper.getAttribute("data-url") || "" }, wrapper);
  });

  // —— 瀑布流（内部含 .markdown-live-photo-mount，稍后统一 hydrate）——
  document.querySelectorAll<HTMLElement>(".markdown-waterfall-wrapper").forEach(wrapper => {
    const lines = (wrapper.textContent || "").split("\n").map(l => l.trim()).filter(Boolean);
    const images: MarkdownWaterfallImage[] = [];
    for (const line of lines) {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length >= 1 && parts[0]!.length > 0) {
        const d = opts.findImageDimensions(parts[0]!);
        images.push({ url: parts[0]!, caption: parts[1] || "", width: d.width, height: d.height });
      }
    }
    if (images.length === 0) {
      wrapper.remove();
      return;
    }
    mount(MarkdownWaterfall, { images }, wrapper);
  });

  // —— 音乐播放器 ——
  document.querySelectorAll<HTMLElement>(".markdown-music-wrapper").forEach(wrapper => {
    const paramsStr = safeDecodeURIComponent(wrapper.getAttribute("data-params") || "");
    let server = "netease";
    let type = "playlist";
    let id = "";
    const parts = paramsStr.split(" ").filter(p => p.trim());
    if (parts.length >= 1) {
      if (parts[0] === "auto" && parts.length >= 2) {
        try {
          const parsedUrl = new URL(parts[1]!);
          if (parsedUrl.hostname.includes("music.163.com")) {
            server = "netease";
            const tm = parsedUrl.pathname.match(/\/(playlist|song|album|artist)\/?/);
            if (tm) type = tm[1]!;
            id = parsedUrl.searchParams.get("id") || "";
          } else if (parsedUrl.hostname.includes("y.qq.com")) {
            server = "tencent";
            const tm = parsedUrl.pathname.match(/\/(playlist|songDetail|albumDetail)\/?/);
            if (tm) type = tm[1]!.replace("Detail", "");
            const im = parsedUrl.pathname.match(/\/([^/]+)$/);
            if (im) id = im[1]!;
          } else if (parsedUrl.hostname.includes("kuwo.cn")) {
            server = "kuwo";
            const tm = parsedUrl.pathname.match(/\/(playlist|song|album)\/?/);
            if (tm) type = tm[1]!;
            const im = parsedUrl.pathname.match(/\/([^/]+)$/);
            if (im) id = im[1]!;
          } else if (parsedUrl.hostname.includes("kugou.com")) {
            server = "kugou";
            const tm = parsedUrl.pathname.match(/\/(song|album|playlist)\/?/);
            if (tm) type = tm[1]!;
            const im = parsedUrl.pathname.match(/\/([^/]+)\.html$/);
            if (im) id = im[1]!;
          }
        } catch {
          // ignore
        }
      } else if (parts.length >= 3) {
        type = parts[0]!;
        server = parts[1]!;
        id = parts[2]!;
      }
    }
    mount(MarkdownMusic, { server, type, id }, wrapper);
  });

  // —— 轮播/瀑布流/独立图片里的 .markdown-live-photo-mount 统一 hydrate（须在上述 widget 挂载之后）——
  document.querySelectorAll<HTMLElement>(".markdown-live-photo-mount").forEach(container => {
    const src = container.getAttribute("data-src") || "";
    const caption = container.getAttribute("data-caption") || "";
    const className = container.getAttribute("data-class") || "";
    const aspectRatio = container.getAttribute("data-aspect-ratio");
    if (!src) return;
    mountLivePhoto(container, {
      src,
      alt: caption,
      class: className,
      aspectRatio: aspectRatio || undefined,
      ...METEING_LIVE_PHOTO_PROPS,
      "data-fancybox": "gallery",
      "data-caption": caption || "图片",
    });
  });

  return {
    cleanup() {
      while (mounted.length) {
        const container = mounted.pop();
        if (container) render(null, container);
      }
    },
  };
}
