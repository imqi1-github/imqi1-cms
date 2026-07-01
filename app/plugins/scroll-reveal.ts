/**
 * 滚动渐入指令插件
 * 支持 SSR（getSSRProps 在服务端注入 data-scroll-reveal 属性）
 */
import scrollRevealDirective from "~/directives/scrollReveal";
import "~/assets/styles/scroll-reveal.css";

export default defineNuxtPlugin((nuxtApp) => {
  // 注册全局指令（服务端和客户端都会执行）
  nuxtApp.vueApp.directive("scroll-reveal", scrollRevealDirective);
});
