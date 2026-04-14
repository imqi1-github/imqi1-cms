// 前台通知 Composable
export const useFrontNotification = () => {
  const notify = (message: string, type: "success" | "error" | "info" = "info") => {
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
