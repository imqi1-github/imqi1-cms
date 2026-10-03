import FloatingVue, { hideAllPoppers } from "floating-vue";
import "~/assets/css/floating-vue.css";

// 切标签页 / 切窗口返回时,浏览器把焦点重派发回原触发元素 → tooltip 再次显示。
// 两层兜底:
//   1) visibilitychange→visible / window.blur:立刻 hideAllPoppers 清当前残留。
//   2) 进入抑制窗口(默认 500ms),期间 floating-vue 显示浮窗给 reference 加
//      aria-describedby 会被观察,派发合成 blur 事件让 floating-vue 的
//      HIDE_EVENT_MAP['focus']='blur' 监听触发 hide → 阻断焦点重派发带来的二次显示。
// 抑制窗口结束后焦点交互恢复正常,无 per-element 残留状态。

const SUPPRESS_DURATION = 500;

export function suppressTooltipOnTabReturn(): () => void {
  let suppressTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressed = false;

  const enterSuppress = () => {
    suppressed = true;
    hideAllPoppers();
    if (suppressTimer !== null) clearTimeout(suppressTimer);
    suppressTimer = setTimeout(() => {
      suppressed = false;
      suppressTimer = null;
    }, SUPPRESS_DURATION);
  };

  // aria-describedby 是 floating-vue 显示时给 reference 必加的属性
  const observer = new MutationObserver(mutations => {
    if (!suppressed) return;
    for (const m of mutations) {
      if (m.attributeName !== "aria-describedby") continue;
      const el = m.target as HTMLElement;
      if (!el.classList?.contains("v-popper--has-tooltip")) continue;
      const describedBy = el.getAttribute("aria-describedby");
      if (!describedBy) continue;
      // 派发合成 blur → 走 floating-vue 的 focus 触发器 hide 路径
      el.dispatchEvent(new Event("blur"));
    }
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-describedby"],
  });

  const onVisibility = () => {
    if (document.visibilityState === "visible") enterSuppress();
  };
  const onBlur = () => enterSuppress();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);

  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    if (suppressTimer !== null) clearTimeout(suppressTimer);
  };
}

export default defineNuxtPlugin(nuxtApp => {
  // 在客户端注册 FloatingVue
  if (import.meta.client) {
    nuxtApp.vueApp.use(FloatingVue, {
      // 全局主题配置
      themes: {
        tooltip: {
          $extend: "dropdown",
          triggers: ["hover", "focus"],
          placement: "bottom",
          instantMove: true,
          distance: 2,
          // tooltip 继承自 dropdown 的 autoHide=true,会让 popper 节点拿到 tabindex=0,
          // 显示时 floating-vue 默认会把焦点从触发元素抢到 popper 上($_applyShowEffect 的 $_popperNode.focus())。
          // 对纯展示型 tooltip 来说这会让触发按钮失焦 → tooltip 又因 focus 触发器隐藏 → 焦点落空,
          // 表现为导航栏按 Tab 时 tooltip 闪一下就消失、焦点丢失、Tab 从头开始。禁用自动聚焦即可。
          noAutoFocus: true,
        },
      },
    });

    // 切标签页 / 切窗口返回时主动收掉 tooltip,防止焦点重派发二次显示
    suppressTooltipOnTabReturn();

    // floating-vue 隐藏 popper 时会设置 aria-hidden，
    // 若 popper 内仍有元素持有焦点，浏览器会阻止 aria-hidden 并抛出警告。
    // 这里在 aria-hidden 生效后立即移出焦点，避免警告。
    const observer = new MutationObserver(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) {
        const popper = active.closest<HTMLElement>('.v-popper__popper[aria-hidden="true"]');
        if (popper) {
          active.blur();
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden'],
    });
  }

  // 在服务端提供指令的 SSR 支持
  if (import.meta.server) {
    nuxtApp.vueApp.directive('tooltip', {
      getSSRProps(binding) {
        // SSR 时返回 title 属性作为降级方案
        return {
          title: binding.value,
        };
      },
      // 客户端时不做任何事情（FloatingVue 会覆盖）
      mounted() {},
      updated() {},
    });
  }
});
