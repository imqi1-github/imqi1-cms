import { watch } from "vue";

export function useScrollbarTheme() {
  const colorMode = useColorMode();

  // 更新滚动条颜色 - 使用 CSS 类切换
  const updateScrollbarColor = (isDark: boolean) => {
    if (!import.meta.client) return;

    const scrollbarStyleId = "scrollbar-theme-style";

    // 移除初始样式和旧样式
    const initStyle = document.getElementById("scrollbar-theme-init");
    if (initStyle) {
      initStyle.remove();
    }

    const oldStyle = document.getElementById(scrollbarStyleId);
    if (oldStyle) {
      oldStyle.remove();
    }

    // 创建新样式
    const style = document.createElement("style");
    style.id = scrollbarStyleId;

    if (isDark) {
      style.textContent = `
        /* 暗色模式滚动条 */
        * {
          scrollbar-width: thin !important;
          scrollbar-color: #475569 #1e293b !important;
        }
        ::-webkit-scrollbar {
          width: 6px !important;
          height: 6px !important;
        }
        ::-webkit-scrollbar-track {
          background-color: #1e293b !important;
        }
        ::-webkit-scrollbar-thumb {
          background-color: #475569 !important;
          border-radius: 3px !important;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: #64748b !important;
        }
      `;
    } else {
      style.textContent = `
        /* 亮色模式滚动条 */
        * {
          scrollbar-width: thin !important;
          scrollbar-color: #cbd5e1 #f1f5f9 !important;
        }
        ::-webkit-scrollbar {
          width: 6px !important;
          height: 6px !important;
        }
        ::-webkit-scrollbar-track {
          background-color: #f1f5f9 !important;
        }
        ::-webkit-scrollbar-thumb {
          background-color: #cbd5e1 !important;
          border-radius: 3px !important;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8 !important;
    }
      `;
    }

    document.head.appendChild(style);
  };

  // 监听颜色模式变化（@vueuse/core v14 的 useColorMode 无 preference 字段，仅 .value；用它
  // 才能解析 system/auto 这类透传到 OS 系统色的偏好，并保持与全站其它消费方一致）。
  watch(
    () => colorMode.value,
    (newValue) => {
      updateScrollbarColor(newValue === "dark");
    },
    { immediate: true }
  );
}
