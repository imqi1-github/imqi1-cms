export default defineNuxtPlugin(() => {
  // httpOnly 的 session cookie 不暴露给 document.cookie，isLogin 读它恒为未登录；
  // 改为委托 useAuth()（其 isLoggedIn 来自 /api/auth/verify，与本插件 verifySession 同一事实源）
  const isLogin = (): boolean => {
    return useAuth().isLoggedIn.value;
  };

  /**
   * 验证会话是否有效（检查是否在其他设备登录）
   * 返回 true 表示有效，false 表示已失效
   */
  const verifySession = async (): Promise<boolean> => {
    try {
      const res = await $fetch("/api/auth/verify");
      return res.valid;
    } catch {
      return false;
    }
  };

  return {
    provide: {
      isLogin,
      verifySession,
    },
  };
});
