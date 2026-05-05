/**
 * 右键菜单指令插件
 * 支持 SSR
 */
import contextMenuDirective from "~/directives/contextMenu";
import "~/assets/styles/context-menu.css";

export default defineNuxtPlugin((nuxtApp) => {
  // 注册全局指令（服务端和客户端都会执行）
  nuxtApp.vueApp.directive("context-menu", contextMenuDirective);
});
