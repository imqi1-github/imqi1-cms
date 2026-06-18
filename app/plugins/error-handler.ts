/**
 * 全局错误处理插件
 * 自动捕获未被 try-catch 处理的错误并显示 toast 提示
 * 代码内已 catch 的错误不会被重复处理
 */
export default defineNuxtPlugin((nuxtApp) => {
  const toast = useToast();

  /**
   * 处理错误并显示 toast 提示
   */
  const handleError = (error: unknown) => {
    // 忽略被标记为已处理的错误
    if ((error as any)?.__handled__ || (error as any)?.response?.__handled__) {
      return;
    }

    console.error("[Global Error]", error);

    // 提取错误信息
    let message = "发生未知错误";

    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "string") {
      message = error;
    } else if (error && typeof error === "object") {
      // 处理 Nuxt createError / h3 错误 / Fetch 错误
      const err = error as {
        message?: string;
        statusMessage?: string;
        statusCode?: number;
        status?: number;
        data?: { message?: string };
        response?: { _data?: { message?: string } };
      };
      message = err.message
        || err.data?.message
        || err.response?._data?.message
        || err.statusMessage
        || `请求失败: ${err.statusCode || err.status || 500}`;
    }

    // 显示错误 toast（仅客户端）
    if (typeof window !== "undefined") {
      toast.error({ message });
    }
  };

  // 1. 捕获 Vue 渲染错误和生命周期错误
  nuxtApp.vueApp.config.errorHandler = (error) => {
    handleError(error);
  };

  // 2. 捕获 Nuxt 应用错误（包括 createError 抛出的错误）
  nuxtApp.hook("vue:error", (error) => {
    handleError(error);
  });

  // 3. 捕获未处理的 Promise 拒绝（包括 $fetch 错误）
  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
      handleError(event.reason);
    });

    // 4. 捕获未处理的 JS 错误
    window.addEventListener("error", (event) => {
      handleError(event.error);
    });
  }

  return {
    provide: {
      /**
       * 手动标记错误为已处理，避免全局提示
       */
      markErrorHandled: (error: any) => {
        if (error) {
          error.__handled__ = true;
        }
        return error;
      },
    },
  };
});
