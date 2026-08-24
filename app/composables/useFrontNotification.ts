// 前台通知 Composable
export const useFrontNotification = () => {
  const notify = (message: string, type: "success" | "error" | "info" = "info") => {
    // 仅客户端派发；防 SSR 期触发时 window 未定义抛 ReferenceError（下游事件监听由浏览器承担）
    if (!import.meta.client) return;
    // 触发自定义事件，由 FrontNotification 组件监听
    window.dispatchEvent(new CustomEvent("front-notification", { detail: { message, type } }));
  };

  return {
    notify,
    success: (message: string) => notify(message, "success"),
    error: (message: string) => notify(message, "error"),
    info: (message: string) => notify(message, "info"),
  };
};
