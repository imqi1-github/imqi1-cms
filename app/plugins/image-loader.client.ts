export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const ATTR_LOADING = "data-img-loading";
  const ATTR_LOADED = "data-img-loaded";
  const WRAPPER_CLASS = "img-loading-wrapper";
  const CLEANUP_EVENT = "img-loading-plugin:cleanup";
  // HMR / dev 重载时先通知旧实例清理全局监听与 observer，避免重复注册
  window.dispatchEvent(new Event(CLEANUP_EVENT));
  let isDisposed = false;
  // 15s 加载超时定时器 id（存在 img 自定义属性上）—— markDone 或 img 移除时清除，避免游离 img 闭包驻留 15s
  const ATTR_TIMER = "data-img-loading-timer";

  // 跳过无需处理的图片
  const shouldSkip = (img: HTMLImageElement): boolean => {
    return (
      !img.src ||
      img.hasAttribute(ATTR_LOADED) ||
      img.classList.contains("inline-emoji") ||
      img.classList.contains("no-img-loading") ||
      // 已经被包裹过了
      img.parentElement?.classList.contains(WRAPPER_CLASS) ||
      // 已经缓存并加载完成，不需要效果
      (img.complete && img.naturalHeight > 0)
    );
  };

  // 创建包裹容器 + 加载 spinner，img 作为子元素
  const wrapImage = (img: HTMLImageElement) => {
    const parent = img.parentNode;
    if (!parent) return;

    // 保存图片的尺寸/布局类到 wrapper，尽量不改变原图在 flex/grid/inline 场景中的占位
    const wrapper = document.createElement("div");
    const preservedClasses = img.className
      .split(/\s+/)
      .filter(cls => /^(?:size-|w-|h-|min-w-|min-h-|max-w-|max-h-|aspect-|shrink|grow|basis-|flex-|self-|place-self-|rounded|overflow-)/.test(cls));
    wrapper.className = [WRAPPER_CLASS, ...preservedClasses].join(" ");

    const imgStyle = window.getComputedStyle(img);
    const display = imgStyle.display;
    wrapper.style.display = display === "none" ? "inline-block" : display === "inline" ? "inline-block" : display;
    wrapper.style.verticalAlign = imgStyle.verticalAlign;

    // 将图片包裹进容器，保持原有布局
    parent.replaceChild(wrapper, img);
    wrapper.appendChild(img);

    // 添加 spinner 元素（绝对定位居中，由 CSS 控制旋转）
    const spinner = document.createElement("div");
    spinner.className = "img-loading-spinner";
    wrapper.appendChild(spinner);
  };

  const markDone = (img: HTMLImageElement) => {
    img.removeAttribute(ATTR_LOADING);
    img.setAttribute(ATTR_LOADED, "true");
    // 清除加载超时定时器，避免 img 已加载完成仍持有闭包 15s
    const timer = img.getAttribute(ATTR_TIMER);
    if (timer) {
      clearTimeout(Number(timer));
      img.removeAttribute(ATTR_TIMER);
    }
    // 隐藏 spinner，spinner 由 CSS 基于 img-loaded 父类隐藏
    const wrapper = img.parentElement;
    if (wrapper?.classList.contains(WRAPPER_CLASS)) {
      wrapper.classList.add("img-loaded");
    }
  };

  const LOADING_TIMEOUT = 15000;

  const markLoading = (img: HTMLImageElement) => {
    if (shouldSkip(img)) return;

    img.setAttribute(ATTR_LOADING, "true");

    wrapImage(img);

    const timerId = window.setTimeout(() => {
      if (isDisposed) return;
      img.removeAttribute(ATTR_TIMER);
      if (!img.hasAttribute(ATTR_LOADED)) {
        markDone(img);
      }
    }, LOADING_TIMEOUT);
    img.setAttribute(ATTR_TIMER, String(timerId));
  };

  const cleanupImage = (img: HTMLImageElement) => {
    // MutationObserver 无 unobserve 单目标 API，只能 disconnect() 全部 —— 这里不处理 attrObserver，
    // 单个 img 的 src 监听开销极小，img 被 GC 后观察自然失效。
    // IntersectionObserver 支持 unobserve，需主动取消以释放视口观察。
    intersectionObserver?.unobserve(img);
    processingQueue = processingQueue.filter(item => item !== img);
    const timer = img.getAttribute(ATTR_TIMER);
    if (timer) {
      clearTimeout(Number(timer));
      img.removeAttribute(ATTR_TIMER);
    }
  };

  const handleDocumentLoad = (e: Event) => {
    if (e.target instanceof HTMLImageElement) {
      markDone(e.target);
    }
  };

  const handleDocumentError = (e: Event) => {
    if (e.target instanceof HTMLImageElement) {
      markDone(e.target);
    }
  };

  // Capture 阶段事件代理：能捕获所有 img 的 load/error，包括后续动态创建的
  document.addEventListener("load", handleDocumentLoad, true);
  document.addEventListener("error", handleDocumentError, true);

  // 监听 src 属性变更（Vue 响应式更新 src 时重新进入加载态）
  const attrObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "src") {
        const img = m.target as HTMLImageElement;
        img.removeAttribute(ATTR_LOADED);
        queueProcessImage(img);
      }
    }
  });

  const observeSrc = (img: HTMLImageElement) => {
    attrObserver.observe(img, {
      attributes: true,
      attributeFilter: ["src"],
    });
  };

  const processImage = (img: HTMLImageElement) => {
    if (shouldSkip(img)) return;
    // 图片已经缓存并完成加载 → 不需要加载效果，直接跳过包裹
    if (img.complete && img.naturalHeight > 0) {
      img.setAttribute(ATTR_LOADED, "true");
      // 不需要包裹，也不需要监听（src 变化时会重新 process）
    } else {
      // 图片未加载完成 → 需要包裹和加载效果
      markLoading(img);
    }
    // 监听 src 属性变更，src 改变时重新处理
    observeSrc(img);
  };

  // ✅ 批量处理队列：当大量图片同时插入时，攒一批在空闲时段处理，减少卡顿
  // ✅ 额外优化：首屏外的图片延迟到 IntersectionObserver 可见时再处理
  let processingQueue: HTMLImageElement[] = [];
  let isFlushScheduled = false;

  // IntersectionObserver 用于延迟处理不在视口内的图片
  let intersectionObserver: IntersectionObserver | null = null;

  const getIntersectionObserver = () => {
    if (!intersectionObserver) {
      intersectionObserver = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const img = entry.target as HTMLImageElement;
              intersectionObserver!.unobserve(img);
              queueProcessImageNow(img);
            }
          }
        },
        {
          rootMargin: "200px", // 提前200px开始准备
        },
      );
    }
    return intersectionObserver;
  };

  const queueProcessImage = (img: HTMLImageElement) => {
    if (shouldSkip(img)) return;

    // 如果图片已经加载完成，立即处理
    if (img.complete && img.naturalHeight > 0) {
      queueProcessImageNow(img);
      return;
    }

    // 检查图片是否已经在DOM树中
    if (!img.isConnected) {
      queueProcessImageNow(img);
      return;
    }

    // 检查图片是否在视口外，如果在视口外，等待进入视口再处理
    const rect = img.getBoundingClientRect();
    const isOutsideViewport = rect.top > window.innerHeight * 2 || rect.bottom < 0;
    if (isOutsideViewport) {
      // 图片在视口外很远，延迟到可见时再处理
      getIntersectionObserver().observe(img);
      return;
    }

    // 否则加入队列批量处理
    queueProcessImageNow(img);
  };

  const queueProcessImageNow = (img: HTMLImageElement) => {
    if (shouldSkip(img)) return;
    processingQueue.push(img);

    if (!isFlushScheduled) {
      isFlushScheduled = true;
      // 在浏览器空闲时批量处理，避免阻塞主线程
      if ("requestIdleCallback" in window) {
        requestIdleCallback(flushProcessingQueue, { timeout: 200 });
      } else {
        // 降级处理：用 setTimeout
        setTimeout(flushProcessingQueue, 0);
      }
    }
  };

  const flushProcessingQueue = () => {
    isFlushScheduled = false;
    const queue = processingQueue.slice();
    processingQueue = [];

    for (const img of queue) {
      processImage(img);
    }
  };

  // 首次扫描已有图片 - 也使用批量处理
  document.querySelectorAll("img").forEach(queueProcessImage);

  // 监听动态插入的节点（Markdown 渲染、JS createElement、组件挂载等）
  const childObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLImageElement) {
          queueProcessImage(node);
        } else if (node instanceof Element) {
          node.querySelectorAll("img").forEach(queueProcessImage);
        }
      }
      // 节点移除时停止观察，避免游离 img 强引用 + 闭包常驻到关页（SPA 导航时旧页 img 会被 Vue 移出 DOM）
      for (const node of m.removedNodes) {
        const removedImgs =
          node instanceof HTMLImageElement
            ? [node]
            : node instanceof Element
              ? Array.from(node.querySelectorAll("img"))
              : [];
        for (const img of removedImgs) {
          cleanupImage(img);
        }
      }
    }
  });

  childObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const cleanupPlugin = () => {
    if (isDisposed) return;
    isDisposed = true;
    window.removeEventListener(CLEANUP_EVENT, cleanupPlugin);
    window.removeEventListener("beforeunload", cleanupPlugin);
    document.removeEventListener("load", handleDocumentLoad, true);
    document.removeEventListener("error", handleDocumentError, true);
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    attrObserver.disconnect();
    childObserver.disconnect();
    const queuedImages = processingQueue.slice();
    processingQueue = [];
    queuedImages.forEach(cleanupImage);
  };

  window.addEventListener(CLEANUP_EVENT, cleanupPlugin, { once: true });
  window.addEventListener("beforeunload", cleanupPlugin, { once: true });
});

