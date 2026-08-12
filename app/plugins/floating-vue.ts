import FloatingVue from "floating-vue";
import "~/assets/css/floating-vue.css";

export default defineNuxtPlugin(nuxtApp => {
  // 在客户端注册 FloatingVue
  if (import.meta.client) {
    nuxtApp.vueApp.use(FloatingVue, {
      // 全局主题配置
      themes: {
        tooltip: {
          $extend: "dropdown",
          triggers: ["hover", "focus"],
          hideOnTargetClick: false,
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
