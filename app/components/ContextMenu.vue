<script setup lang="ts">
const route = useRoute();
const { notify } = useFrontNotification();

// 菜单状态
const visible = ref(false);
const x = ref(0);
const y = ref(0);
const menuType = ref<"default" | "text" | "link" | "input">("default");
const selectedText = ref("");
const linkTarget = ref<HTMLAnchorElement | null>(null);
const inputTarget = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);

// 关闭菜单
const closeMenu = () => {
  visible.value = false;
};

// 判断是否为链接
const isBrowsableLink = (str: string): boolean => {
  try {
    const url = new URL(str);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    const tlds = ["com", "net", "org", "io", "cn", "xyz", "top", "site", "info", "cc", "tv", "app", "dev", "me", "ai", "website"];
    const tldPattern = tlds.join("|");
    const regex = new RegExp(`^(?:[a-zA-Z0-9-]+\\.)+(?:${tldPattern})(?:/.*)?$`, "i");
    return regex.test(str);
  }
};

// 处理右键菜单
const handleContextMenu = (e: MouseEvent) => {
  // 只在PC端显示，移动端不显示
  if (window.innerWidth < 768) {
    console.log("[ContextMenu] 移动端，不显示菜单");
    return;
  }

  // 按住Ctrl键时不显示自定义菜单
  if (e.ctrlKey) {
    console.log("[ContextMenu] 按住Ctrl键，使用系统菜单");
    return;
  }

  console.log("[ContextMenu] 显示右键菜单", e.target);
  e.preventDefault();

  // fixed 定位使用视口坐标，不需要加滚动距离
  let left = e.clientX;
  let top = e.clientY;

  // 判断菜单类型
  const selection = window.getSelection()?.toString().trim();
  const target = e.target as HTMLElement;

  if (selection && isBrowsableLink(selection)) {
    menuType.value = "link";
    selectedText.value = selection.startsWith("http") ? selection : "https://" + selection;
    linkTarget.value = document.createElement("a");
    linkTarget.value.setAttribute("href", selectedText.value);
    linkTarget.value.textContent = selectedText.value;
  } else if (selection) {
    menuType.value = "text";
    selectedText.value = selection;
  } else if (target.tagName === "A") {
    menuType.value = "link";
    linkTarget.value = target as HTMLAnchorElement;
  } else if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
    menuType.value = "input";
    inputTarget.value = target as HTMLInputElement | HTMLTextAreaElement;
  } else {
    menuType.value = "default";
  }

  // 先设置初始位置和显示状态
  x.value = left;
  y.value = top;
  visible.value = true;

  // 然后调整位置（避免超出屏幕）
  nextTick(() => {
    if (!menuRef.value) {
      console.error("[ContextMenu] 菜单元素未找到");
      return;
    }

    const menuWidth = menuRef.value.offsetWidth;
    const menuHeight = menuRef.value.offsetHeight;
    const documentWidth = window.innerWidth;
    const documentHeight = window.innerHeight;

    if (documentWidth - 20 < left + menuWidth) {
      x.value = documentWidth - menuWidth - 20;
    }

    if (documentHeight - 20 < top + menuHeight) {
      y.value = documentHeight - menuHeight - 20;
    }

    console.log("[ContextMenu] 菜单位置", { x: x.value, y: y.value, menuType: menuType.value });
  });
};

// 菜单操作
const handleBack = () => {
  history.back();
  closeMenu();
};

const handleForward = () => {
  history.forward();
  closeMenu();
};

const handleRefresh = () => {
  location.reload();
  closeMenu();
};

const handleCopyLink = () => {
  navigator.clipboard.writeText(window.location.href);
  notify("复制本页链接成功", "success");
  closeMenu();
};

const handleBaiduSearch = () => {
  window.open(`https://www.baidu.com/s?wd=${encodeURIComponent(selectedText.value)}`, "_blank");
  closeMenu();
};

const handleBingSearch = () => {
  window.open(`https://www.bing.com/search?q=${encodeURIComponent(selectedText.value)}`, "_blank");
  closeMenu();
};

const handleGoogleSearch = () => {
  window.open(`https://www.google.com/search?q=${encodeURIComponent(selectedText.value)}`, "_blank");
  closeMenu();
};

const handleCopyText = () => {
  navigator.clipboard.writeText(selectedText.value);
  notify("复制成功，在其他网站引用时请注明出处", "success");
  closeMenu();
};

const handleCopyLinkText = () => {
  if (linkTarget.value) {
    const text = linkTarget.value.innerText?.replace(/\s/g, "") || "";
    navigator.clipboard.writeText(text);
    notify("复制链接文字成功", "success");
    closeMenu();
  }
};

const handleCopyLinkUrl = () => {
  if (linkTarget.value) {
    const link = linkTarget.value.getAttribute("href") || "";
    navigator.clipboard.writeText(link);
    notify("复制链接地址成功", "success");
    closeMenu();
  }
};

const handleOpenLink = () => {
  if (linkTarget.value) {
    const link = linkTarget.value.getAttribute("href");
    if (link) window.open(link, "_blank");
    closeMenu();
  }
};

const handleCopyInput = () => {
  if (inputTarget.value) {
    const text = inputTarget.value.value;
    navigator.clipboard.writeText(text);
    notify("复制成功", "success");
    closeMenu();
  }
};

const handlePasteInput = async () => {
  if (inputTarget.value) {
    try {
      const text = await navigator.clipboard.readText();
      inputTarget.value.value += text;
      notify("粘贴成功", "success");
      closeMenu();
    } catch {
      notify("粘贴失败", "error");
    }
  }
};

// 回到顶部
const handleScrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  closeMenu();
};

// 打印页面
const handlePrint = () => {
  window.print();
  closeMenu();
};

// 全选
const handleSelectAll = () => {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(document.body);
  selection?.removeAllRanges();
  selection?.addRange(range);
  closeMenu();
};

// 切换深色模式
const colorMode = useColorMode();
const handleToggleTheme = () => {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
  closeMenu();
};

// 复制页面标题
const handleCopyTitle = () => {
  const title = document.title;
  navigator.clipboard.writeText(title);
  notify("复制页面标题成功", "success");
  closeMenu();
};

// 复制页面标题和链接
const handleCopyTitleAndLink = () => {
  const title = document.title;
  const url = window.location.href;
  navigator.clipboard.writeText(`${title} - ${url}`);
  notify("复制标题和链接成功", "success");
  closeMenu();
};

// 输入框剪切
const handleCutInput = () => {
  if (inputTarget.value) {
    const start = inputTarget.value.selectionStart;
    const end = inputTarget.value.selectionEnd;
    const text = inputTarget.value.value.slice(start, end);
    navigator.clipboard.writeText(text);
    inputTarget.value.value = inputTarget.value.value.slice(0, start) + inputTarget.value.value.slice(end);
    inputTarget.value.setSelectionRange(start, start);
    notify("剪切成功", "success");
    closeMenu();
  }
};

// 输入框全选
const handleSelectAllInput = () => {
  if (inputTarget.value) {
    inputTarget.value.select();
    closeMenu();
  }
};

// 清空输入框
const handleClearInput = () => {
  if (inputTarget.value) {
    inputTarget.value.value = "";
    notify("已清空", "success");
    closeMenu();
  }
};

// 转换为大写
const handleToUpperCase = () => {
  if (inputTarget.value) {
    const start = inputTarget.value.selectionStart;
    const end = inputTarget.value.selectionEnd;
    const text = inputTarget.value.value.slice(start, end);
    if (text) {
      inputTarget.value.value = inputTarget.value.value.slice(0, start) + text.toUpperCase() + inputTarget.value.value.slice(end);
      inputTarget.value.setSelectionRange(start, end);
      closeMenu();
    }
  }
};

// 转换为小写
const handleToLowerCase = () => {
  if (inputTarget.value) {
    const start = inputTarget.value.selectionStart;
    const end = inputTarget.value.selectionEnd;
    const text = inputTarget.value.value.slice(start, end);
    if (text) {
      inputTarget.value.value = inputTarget.value.value.slice(0, start) + text.toLowerCase() + inputTarget.value.value.slice(end);
      inputTarget.value.setSelectionRange(start, end);
      closeMenu();
    }
  }
};

// 首字母大写
const handleCapitalize = () => {
  if (inputTarget.value) {
    const start = inputTarget.value.selectionStart;
    const end = inputTarget.value.selectionEnd;
    const text = inputTarget.value.value.slice(start, end);
    if (text) {
      const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
      inputTarget.value.value = inputTarget.value.value.slice(0, start) + capitalized + inputTarget.value.value.slice(end);
      inputTarget.value.setSelectionRange(start, end);
      closeMenu();
    }
  }
};

// 监听全局右键事件
onMounted(() => {
  console.log("[ContextMenu] 组件已挂载，开始监听右键事件");
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("click", closeMenu);
  document.addEventListener("scroll", closeMenu);
});

onUnmounted(() => {
  document.removeEventListener("contextmenu", handleContextMenu);
  document.removeEventListener("click", closeMenu);
  document.removeEventListener("scroll", closeMenu);
});
</script>

<template>
  <div
    v-if="visible"
    ref="menuRef"
    @click.stop
    class="context-menu font-serif fixed z-10000 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-40"
    :style="{ left: `${x}px`, top: `${y}px` }">
    <!-- 默认菜单 -->
    <ul v-if="menuType === 'default'" class="py-1">
      <li
        @click="handleBack"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:arrow-left-line" class="size-4" />
        <span>返回</span>
      </li>
      <li
        @click="handleForward"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:arrow-right-line" class="size-4" />
        <span>前进</span>
      </li>
      <li
        @click="handleRefresh"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:refresh-line" class="size-4" />
        <span>刷新</span>
      </li>
      <li
        @click="handleScrollToTop"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:arrow-up-line" class="size-4" />
        <span>回到顶部</span>
      </li>
      <li class="border-t border-gray-200 dark:border-gray-700 my-1"></li>
      <li
        @click="handleCopyLink"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:link" class="size-4" />
        <span>复制本页链接</span>
      </li>
      <li
        @click="handleCopyTitle"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:heading" class="size-4" />
        <span>复制页面标题</span>
      </li>
      <li
        @click="handleCopyTitleAndLink"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:file-text-line" class="size-4" />
        <span>复制标题和链接</span>
      </li>
      <li class="border-t border-gray-200 dark:border-gray-700 my-1"></li>
      <li
        @click="handlePrint"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:printer-line" class="size-4" />
        <span>打印页面</span>
      </li>
    </ul>

    <!-- 文本菜单 -->
    <ul v-if="menuType === 'text'" class="py-1">
      <li
        @click="handleBaiduSearch"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:baidu-fill" class="size-4" />
        <span>百度搜索</span>
      </li>
      <li
        @click="handleBingSearch"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="size-4" width="256" height="388" viewBox="0 0 256 388"><defs><radialGradient id="SVGGZQEKcDW" cx="93.717%" cy="77.818%" r="143.121%" fx="93.717%" fy="77.818%" gradientTransform="matrix(-.65486 -.5438 .75575 -.4712 .963 1.654)"><stop offset="0%" stop-color="#00cacc"/><stop offset="100%" stop-color="#048fce"/></radialGradient><radialGradient id="SVG8Pn4lbDv" cx="13.893%" cy="71.448%" r="150.086%" fx="13.893%" fy="71.448%" gradientTransform="matrix(.55155 -.39387 .23634 .91917 -.107 .112)"><stop offset="0%" stop-color="#00bbec"/><stop offset="100%" stop-color="#2756a9"/></radialGradient><linearGradient id="SVGavx67sXC" x1="50%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#00bbec"/><stop offset="100%" stop-color="#2756a9"/></linearGradient></defs><path fill="url(#SVGGZQEKcDW)" d="M129.424 122.047c-7.133.829-12.573 6.622-13.079 13.928c-.218 3.147-.15 3.36 6.986 21.722c16.233 41.774 20.166 51.828 20.827 53.243c1.603 3.427 3.856 6.65 6.672 9.544c2.16 2.22 3.585 3.414 5.994 5.024c4.236 2.829 6.337 3.61 22.818 8.49c16.053 4.754 24.824 7.913 32.381 11.664c9.791 4.86 16.623 10.387 20.944 16.946c3.1 4.706 5.846 13.145 7.04 21.64c.468 3.321.47 10.661.006 13.663c-1.008 6.516-3.021 11.976-6.101 16.545c-1.638 2.43-1.068 2.023 1.313-.939c6.74-8.379 13.605-22.7 17.108-35.687c4.24-15.718 4.817-32.596 1.66-48.57c-6.147-31.108-25.786-57.955-53.444-73.06c-1.738-.95-8.357-4.42-17.331-9.085a1633 1633 0 0 1-4.127-2.154c-.907-.477-2.764-1.447-4.126-2.154c-1.362-.708-5.282-2.75-8.711-4.539l-8.528-4.446a6021 6021 0 0 1-8.344-4.357c-8.893-4.655-12.657-6.537-13.73-6.863c-1.125-.343-3.984-.782-4.701-.723c-.152.012-.838.088-1.527.168"/><path fill="url(#SVG8Pn4lbDv)" d="M148.81 277.994c-.493.292-1.184.714-1.537.938c-.354.225-1.137.712-1.743 1.083a8315 8315 0 0 0-13.204 8.137a2848 2848 0 0 0-8.07 4.997a388 388 0 0 1-3.576 2.198c-.454.271-2.393 1.465-4.31 2.654a2652 2652 0 0 1-7.427 4.586a3958 3958 0 0 0-8.62 5.316a3011 3011 0 0 1-7.518 4.637c-1.564.959-3.008 1.885-3.21 2.058c-.3.257-14.205 8.87-21.182 13.121c-5.3 3.228-11.43 5.387-17.705 6.235c-2.921.395-8.45.396-11.363.003c-7.9-1.067-15.176-4.013-21.409-8.666c-2.444-1.826-7.047-6.425-8.806-8.8c-4.147-5.598-6.829-11.602-8.218-18.396c-.32-1.564-.622-2.884-.672-2.935c-.13-.13.105 2.231.528 5.319c.44 3.211 1.377 7.856 2.387 11.829c7.814 30.743 30.05 55.749 60.15 67.646c8.668 3.424 17.415 5.582 26.932 6.64c3.576.4 13.699.56 17.43.276c17.117-1.296 32.02-6.334 47.308-15.996c1.362-.86 3.92-2.474 5.685-3.585a877 877 0 0 0 4.952-3.14c.958-.615 2.114-1.341 2.567-1.614a91 91 0 0 0 2.018-1.268c.656-.424 3.461-2.2 6.235-3.944l11.092-7.006l3.809-2.406l.137-.086l.42-.265l.199-.126l2.804-1.771l9.69-6.121c12.348-7.759 16.03-10.483 21.766-16.102c2.392-2.342 5.997-6.34 6.176-6.848c.037-.104.678-1.092 1.424-2.197c3.036-4.492 5.06-9.995 6.064-16.484c.465-3.002.462-10.342-.005-13.663c-.903-6.42-2.955-13.702-5.167-18.339c-3.627-7.603-11.353-14.512-22.453-20.076c-3.065-1.537-6.23-2.943-6.583-2.924c-.168.009-10.497 6.322-22.954 14.03c-12.457 7.71-23.268 14.4-24.025 14.87s-2.056 1.263-2.888 1.764z"/><path fill="url(#SVGavx67sXC)" d="m.053 241.013l.054 53.689l.695 3.118c2.172 9.747 5.937 16.775 12.482 23.302c3.078 3.07 5.432 4.922 8.768 6.896c7.06 4.177 14.657 6.238 22.978 6.235c8.716-.005 16.256-2.179 24.025-6.928c1.311-.801 6.449-3.964 11.416-7.029l9.032-5.572v-127.4l-.002-58.273c-.002-37.177-.07-59.256-.188-60.988c-.74-10.885-5.293-20.892-12.948-28.461c-2.349-2.323-4.356-3.875-10.336-7.99a25160 25160 0 0 1-12.104-8.336L28.617 5.835C22.838 1.85 22.386 1.574 20.639.949C18.367.136 15.959-.163 13.67.084C6.998.804 1.657 5.622.269 12.171C.053 13.191.013 26.751.01 100.35l-.003 86.975H0z"/></svg>
        <span>Bing搜索</span>
      </li>
      <li
        @click="handleGoogleSearch"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="material-icon-theme:google" class="size-4" />
        <span>Google搜索</span>
      </li>
      <li class="border-t border-gray-200 dark:border-gray-700 my-1"></li>
      <li
        @click="handleCopyText"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:file-copy-line" class="size-4" />
        <span>复制文本</span>
      </li>
      <li
        @click="handleSelectAll"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:checkbox-circle-line" class="size-4" />
        <span>全选</span>
      </li>
    </ul>

    <!-- 链接菜单 -->
    <ul v-if="menuType === 'link'" class="py-1">
      <li
        @click="handleCopyLinkText"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:file-text-line" class="size-4" />
        <span>复制链接文字</span>
      </li>
      <li
        @click="handleCopyLinkUrl"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:link" class="size-4" />
        <span>复制链接地址</span>
      </li>
      <li
        @click="handleOpenLink"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:external-link-line" class="size-4" />
        <span>访问链接</span>
      </li>
    </ul>

    <!-- 输入框菜单 -->
    <ul v-if="menuType === 'input'" class="py-1">
      <li
        @click="handleSelectAllInput"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:checkbox-circle-line" class="size-4" />
        <span>全选</span>
      </li>
      <li
        @click="handleCopyInput"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:file-copy-line" class="size-4" />
        <span>复制</span>
      </li>
      <li
        @click="handleCutInput"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:scissors-cut-line" class="size-4" />
        <span>剪切</span>
      </li>
      <li
        @click="handlePasteInput"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:clipboard-line" class="size-4" />
        <span>粘贴</span>
      </li>
      <li class="border-t border-gray-200 dark:border-gray-700 my-1"></li>
      <li
        @click="handleToUpperCase"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:arrow-up-line" class="size-4" />
        <span>转大写</span>
      </li>
      <li
        @click="handleToLowerCase"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:arrow-down-line" class="size-4" />
        <span>转小写</span>
      </li>
      <li
        @click="handleCapitalize"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:text" class="size-4" />
        <span>首字母大写</span>
      </li>
      <li class="border-t border-gray-200 dark:border-gray-700 my-1"></li>
      <li
        @click="handleClearInput"
        class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Icon name="ri:delete-bin-line" class="size-4" />
        <span>清空</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.context-menu {
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
