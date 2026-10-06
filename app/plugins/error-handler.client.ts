/**
 * Vue app-level error handler + 浏览器 unhandledrejection / error 监听。
 *
 * 仅在客户端运行：服务端错误由 server/plugins/error-handler.ts (nitro) 处理。
 *
 * 用户已不再要求客户端上报服务端：错误监控走 console + 文件日志，由运维侧扫描即可。
 * 浏览器侧只把异常打到 console.error 让开发者工具可见；不再 POST 上报。
 */

function safeString(v: unknown, max = 500): string | undefined {
  if (typeof v !== "string") return undefined;
  return v.length > max ? v.slice(0, max) : v;
}

export default defineNuxtPlugin(nuxtApp => {
  if (import.meta.server) return;

  // Vue 组件渲染/事件错误
  nuxtApp.vueApp.config.errorHandler = (err, _instance, info) => {
    try {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[client error]", message, { info: safeString(info, 80), stack });
    } catch {
      /* swallow */
    }
  };

  // 浏览器 promise rejection
  window.addEventListener("unhandledrejection", e => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : safeString(reason, 200) ?? "(unhandled rejection)";
    console.error("[client unhandledrejection]", message, reason instanceof Error ? reason.stack : "");
  });

  // 浏览器运行时错误
  window.addEventListener("error", e => {
    const message = safeString(e.message, 500) ?? "(unknown error)";
    console.error("[client window.onerror]", message, { filename: safeString(e.filename, 200) });
  });
});