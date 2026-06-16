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
