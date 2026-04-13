import FloatingVue from "floating-vue";
import "~/assets/css/floating-vue.css";

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.vueApp.use(FloatingVue, {
    // 全局主题配置
    themes: {
      tooltip: {
        $extend: "dropdown",
        triggers: ["hover", "pointer", "touch", "click", "focus"],
        placement: "bottom",
        autoHide: false,
      },
    },
  });
});
