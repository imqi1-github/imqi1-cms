import type { FancyboxConfig, FancyboxEventHandler, FancyboxLike, FancyboxSlide } from "~/types/fancybox";

/**
 * Fancybox 灯箱实况照片增强
 *
 * 功能：在 Fancybox 灯箱中为实况照片提供与 LivePhoto 组件一致的交互体验。
 * - 灯箱打开后，若当前图片带有 data-live-photo 标记：
 *   - 左上角显示 "▶ 实况" 标识（播放时隐藏）
 *   - 右下角显示播放/暂停按钮
 * - 点击播放按钮：从图片文件中提取内嵌 MP4，视频以交叉淡入方式覆盖图片播放
 * - 再次点击或播放结束：视频渐出，恢复静态图片（保留 Panzoom 缩放/拖拽）
 * - 切换幻灯片/关闭灯箱时：自动清理 Blob URL 和 DOM 元素
 *
 * 技术要点（Fancybox v6）：
 * - Carousel.settle 事件在初始加载时不会触发（isSettled 初始为 true），
 *   初始注入依赖 ready / Carousel.ready 事件
 * - Carousel 事件经通配符转发后，第一个参数是 Fancybox 实例
 *
 * 用法：
 *   const { enhanceConfig } = useFancyboxLivePhoto();
 *   Fancybox.bind(container, "[data-fancybox]", enhanceConfig({ ...原有配置... }));
 */
export const useFancyboxLivePhoto = () => {
  const { extractMotionVideo } = useLivePhoto();

  // ---- 模块级状态（跨事件回调共享）----
  let currentVideoUrl: string | null = null;
  let currentVideoEl: HTMLVideoElement | null = null;
  let currentTipEl: HTMLElement | null = null;
  let currentPlayBtnEl: HTMLElement | null = null;
  let currentImageUrl: string | null = null;
  // 覆盖层挂载容器（图片的父元素 .f-panzoom__wrapper），视频挂到这里
  // 这样视频 inset:0 只覆盖图片区域，不会遮挡 caption
  let currentMountEl: HTMLElement | null = null;
  let isExtracting = false;
  // ✅ 用于取消实况视频提取请求
  let extractAbortController: AbortController | null = null;

  /**
   * 查找覆盖层应挂载的容器（图片的父元素）
   * 优先级：.f-panzoom__wrapper > .fancybox__content > slide 本身
   */
  function findMountEl(slideEl: HTMLElement): HTMLElement {
    const wrapper = slideEl.querySelector<HTMLElement>(".f-panzoom__wrapper");
    if (wrapper) return wrapper;
    const content = slideEl.querySelector<HTMLElement>(".fancybox__content");
    if (content) return content;
    return slideEl;
  }

  /** 设置播放状态：淡出/恢复 wrapper 内所有非视频子元素（含 Panzoom 放大的图片） */
  function setPlaying(playing: boolean) {
    if (!currentMountEl) return;
    currentMountEl.classList.toggle("is-flp-playing", playing);
  }

  /** 移除灯箱内所有实况照片的覆盖层（tip / 按钮 / 视频） */
  function removeAllOverlays(fancybox?: FancyboxLike) {
    const container = fancybox?.getContainer?.();
    if (container) {
      container.querySelectorAll(".flp-tip, .flp-play-btn, .flp-video").forEach((el: Element) => el.remove());
    }
    // 清理挂载容器上的状态 class
    currentMountEl?.classList.remove("flp-host", "is-flp-playing");
    currentVideoEl = null;
    currentTipEl = null;
    currentPlayBtnEl = null;
    currentMountEl = null;
  }

  /** 释放当前 Blob URL */
  function revokeVideo() {
    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = null;
    }
  }

  /** 完整清理：DOM + Blob URL + 状态 + 取消进行中的请求 */
  function fullCleanup(fancybox?: FancyboxLike) {
    // ✅ 先取消正在进行的视频提取
    if (extractAbortController) {
      extractAbortController.abort();
      extractAbortController = null;
    }
    removeAllOverlays(fancybox);
    revokeVideo();
    currentImageUrl = null;
  }

  /** 判断是否为实况照片（检查 DOM 属性或 slide 数据） */
  function isLivePhotoSlide(slide: FancyboxSlide | null | undefined): boolean {
    if (!slide) return false;
    const triggerEl = slide?.triggerEl;
    if (triggerEl && triggerEl.hasAttribute && triggerEl.hasAttribute("data-live-photo")) {
      return true;
    }
    return slide.livePhoto !== undefined;
  }

  /** 停止视频：渐出 + 暂停，恢复 tip、播放按钮和图片显示 */
  function stopVideo() {
    if (currentVideoEl) {
      currentVideoEl.classList.remove("is-visible");
      currentVideoEl.pause();
      const el = currentVideoEl;
      // 渐出动画结束后重置进度（与 transition 时长一致）
      setTimeout(() => {
        if (el && !el.classList.contains("is-visible")) {
          el.currentTime = 0;
        }
      }, 300);
    }
    // 恢复 wrapper 内图片等内容的显示（与视频渐出同步交叉淡入）
    setPlaying(false);
    currentTipEl?.classList.remove("is-hidden");
    currentPlayBtnEl?.classList.remove("is-playing");
  }

  /** 点击播放按钮：切换视频播放/停止 */
  async function toggleVideo() {
    // 正在播放 → 停止
    if (currentVideoEl?.classList.contains("is-visible")) {
      stopVideo();
      return;
    }

    const mountEl = currentMountEl;
    if (!mountEl || !currentImageUrl) return;

    const targetUrl = currentImageUrl;

    // 首次点击：提取视频（防止快速连点导致重复提取）
    if (!currentVideoUrl) {
      if (isExtracting) return;
      isExtracting = true;
      currentPlayBtnEl?.classList.add("is-loading");

      // ✅ 创建新的 AbortController
      extractAbortController = new AbortController();
      currentVideoUrl = await extractMotionVideo(targetUrl, extractAbortController.signal);
      extractAbortController = null;
      isExtracting = false;

      // 提取期间用户切换了幻灯片或关闭了灯箱 → 放弃
      if (currentImageUrl !== targetUrl) {
        if (currentVideoUrl) {
          URL.revokeObjectURL(currentVideoUrl);
          currentVideoUrl = null;
        }
        return;
      }
      currentPlayBtnEl?.classList.remove("is-loading");
    }

    if (!currentVideoUrl) return;

    // 创建视频元素（首次或已被移除时）
    if (!currentVideoEl || !currentVideoEl.parentElement) {
      const video = document.createElement("video");
      video.className = "flp-video";
      video.src = currentVideoUrl;
      video.muted = true;
      video.setAttribute("playsinline", "");
      video.preload = "auto";
      video.addEventListener("ended", () => stopVideo());
      mountEl.appendChild(video);
      currentVideoEl = video;

      // 强制回流，确保浏览器记录初始 opacity:0 状态，transition 才能正确触发
      void video.offsetHeight;
    }

    // 重置到开头
    currentVideoEl.currentTime = 0;

    // 交叉淡入：双 raf 确保初始 opacity:0 已应用，再切换到 is-visible
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        currentVideoEl?.classList.add("is-visible");
        // 同步淡出 wrapper 内所有非视频内容（含 Panzoom 放大的图片）
        setPlaying(true);
      });
    });

    // 隐藏 tip、切换按钮图标
    currentTipEl?.classList.add("is-hidden");
    currentPlayBtnEl?.classList.add("is-playing");

    try {
      await currentVideoEl.play();
    } catch {
      stopVideo();
    }
  }

  /**
   * 为当前幻灯片注入覆盖层（仅对实况照片生效）
   * - 左上角：▶ 实况 标识
   * - 右下角：播放/暂停按钮
   */
  function injectOverlays(slide: FancyboxSlide | null | undefined): boolean {
    const slideEl = slide?.el as HTMLElement | undefined;
    if (!slideEl) {
      return false;
    }

    if (!isLivePhotoSlide(slide)) {
      return false;
    }

    // 视频覆盖层挂到图片父容器（与图片精确重叠）
    currentMountEl = findMountEl(slideEl);
    // 标记宿主：CSS 据此为子元素预设 opacity transition，播放时通过 is-flp-playing 淡出
    currentMountEl.classList.add("flp-host");

    // 避免重复注入
    if (slideEl.querySelector(".flp-tip")) return false;

    const imageUrl: string | undefined = slide?.src || slide?.triggerEl?.src;
    if (!imageUrl) {
      return false;
    }

    currentImageUrl = imageUrl;

    // 左上角 "▶ 实况" 标识（挂到 slide，位于灯箱视口左上角，图片之外）
    const tip = document.createElement("div");
    tip.className = "flp-tip";
    tip.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" class="flp-tip__icon">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span>实况</span>
    `;
    slideEl.appendChild(tip);
    currentTipEl = tip;

    // 右下角播放/暂停按钮（挂到 slide，位于灯箱视口右下角，图片之外）
    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "flp-play-btn";
    playBtn.setAttribute("aria-label", "播放实况照片");
    playBtn.innerHTML = `
      <svg class="flp-play-btn__icon flp-play-btn__icon-play" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <svg class="flp-play-btn__icon flp-play-btn__icon-pause" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
      </svg>
      <svg class="flp-play-btn__icon flp-play-btn__icon-loading" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="50 30" />
      </svg>
    `;
    playBtn.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      toggleVideo();
    });
    slideEl.appendChild(playBtn);
    currentPlayBtnEl = playBtn;

    return true;
  }

  /** 轮询注入，直到 slide.el 可用或达到最大尝试次数 */
  function tryInjectWithRetry(fancybox: FancyboxLike, maxAttempts = 10) {
    const tryInject = (attempt: number) => {
      const slide = fancybox?.getSlide?.();
      if (slide?.el) {
        injectOverlays(slide);
      } else if (attempt < maxAttempts) {
        requestAnimationFrame(() => tryInject(attempt + 1));
      }
    };
    tryInject(0);
  }

  /**
   * 增强 Fancybox 配置，注入实况照片事件处理
   *
   * 事件策略：
   * - ready / Carousel.ready：初始加载时注入（Carousel.settle 初始不触发）
   * - Carousel.settle：切换幻灯片后重新注入
   * - Carousel.change：开始切换时停止视频
   * - close / destroy：完整清理
   */
  function enhanceConfig(config: FancyboxConfig = {}): FancyboxConfig {
    const userOn: Record<string, FancyboxEventHandler> = config.on || {};

    const wrap = (key: string, handler: (fancybox: FancyboxLike, ...args: unknown[]) => void) => {
      const orig = userOn[key];

      return (...args: unknown[]) => {
        orig?.(...args);

        const fancybox = args[0] as FancyboxLike | undefined;
        if (!fancybox) return;

        handler(fancybox, ...args.slice(1));
      };
    };

    return {
      ...config,
      on: {
        ...userOn,
        ready: wrap("ready", fancybox => {
          requestAnimationFrame(() => tryInjectWithRetry(fancybox));
        }),
        "Carousel.ready": wrap("Carousel.ready", fancybox => {
          requestAnimationFrame(() => {
            const slide = fancybox.getSlide?.();
            if (slide?.el) injectOverlays(slide);
          });
        }),
        "Carousel.settle": wrap("Carousel.settle", (fancybox, _carousel, slide) => {
          removeAllOverlays(fancybox);
          revokeVideo();

          const targetSlide = slide || fancybox.getSlide?.();
          if (targetSlide) injectOverlays(targetSlide);
        }),
        "Carousel.change": wrap("Carousel.change", () => {
          stopVideo();
        }),
        close: wrap("close", (fancybox: FancyboxLike) => {
          fullCleanup(fancybox);
        }),
        destroy: wrap("destroy", (fancybox: FancyboxLike) => {
          fullCleanup(fancybox);
        }),
      },
    };
  }

  return { enhanceConfig };
};
