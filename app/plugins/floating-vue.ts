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
