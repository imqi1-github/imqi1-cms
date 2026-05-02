import { computed } from "vue";

/**
 * 主题切换 composable
 * 统一管理亮暗模式切换逻辑，避免代码重复
 */
export function useThemeToggle() {
  const colorMode = useColorMode();

  // 防抖锁，避免快速点击导致性能问题
  let isTransitioning = false;

  // 当前是否为暗色模式
  const isDark = computed(() => colorMode.value === "dark");

  /**
   * 切换亮暗模式
   * 与所有浏览器保持一致的过渡效果
   */
  const toggleTheme = () => {
    // 防抖：如果在过渡中，直接返回
    if (isTransitioning) return;

    // 判断当前模式并切换
    const isCurrentDark = colorMode.preference === "dark";
    const newMode = isCurrentDark ? "light" : "dark";

    // 设置锁
    isTransitioning = true;

    // 添加过渡类
    document.documentElement.classList.add("theme-transitioning");

    // 切换主题
    colorMode.preference = newMode;

    // 350ms 后移除过渡类并释放锁
    setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
      isTransitioning = false;
    }, 350);
  };

  return {
    isDark,
    toggleTheme,
  };
}
