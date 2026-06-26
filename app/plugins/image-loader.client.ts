export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const ATTR_LOADING = "data-img-loading";
  const ATTR_LOADED = "data-img-loaded";
  const WRAPPER_CLASS = "img-loading-wrapper";

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

    // 保存原有的 inline style 和 class
    const wrapper = document.createElement("div");
    // 复制图片的宽高类到 wrapper，保持原有布局
    const widthClasses = (img.className.match(/(^|\s)w-\S+/g) || []).join(" ");
    const heightClasses = (img.className.match(/(^|\s)h-\S+/g) || []).join(" ");
    wrapper.className = `${WRAPPER_CLASS} ${widthClasses} ${heightClasses}`;

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
    // 隐藏 spinner，spinner 由 CSS 基于 img-loaded 父类隐藏
    const wrapper = img.parentElement;
    if (wrapper?.classList.contains(WRAPPER_CLASS)) {
      wrapper.classList.add("img-loaded");
    }
  };

  const markLoading = (img: HTMLImageElement) => {
    if (shouldSkip(img)) return;
    img.setAttribute(ATTR_LOADING, "true");
    wrapImage(img);
  };

  // Capture 阶段事件代理：能捕获所有 img 的 load/error，包括后续动态创建的
  document.addEventListener(
    "load",
    (e) => {
      if (e.target instanceof HTMLImageElement) {
        markDone(e.target);
      }
    },
    true
  );

  document.addEventListener(
    "error",
    (e) => {
      if (e.target instanceof HTMLImageElement) {
        markDone(e.target);
      }
    },
    true
  );

  // 监听 src 属性变更（Vue 响应式更新 src 时重新进入加载态）
  const attrObserver = new MutationObserver((mutations) => {
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
      intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            intersectionObserver!.unobserve(img);
            queueProcessImageNow(img);
          }
        }
      }, {
        rootMargin: '200px', // 提前200px开始准备
      });
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
    const isOutsideViewport = rect.top > window.innerHeight * 2 && rect.bottom < 0;
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
      if ('requestIdleCallback' in window) {
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
  const childObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLImageElement) {
          queueProcessImage(node);
        } else if (node instanceof Element) {
          node.querySelectorAll("img").forEach(queueProcessImage);
        }
      }
    }
  });

  childObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // 清理 observer 在页面卸载时
  if (import.meta.client) {
    window.addEventListener('beforeunload', () => {
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }
      attrObserver.disconnect();
      childObserver.disconnect();
    });
  }
});
