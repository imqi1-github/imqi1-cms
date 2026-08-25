export default defineNuxtPlugin(() => {
  // httpOnly 的 session cookie 不暴露给 document.cookie，isLogin 读它恒为未登录；
  // 改为委托 useAuth()（其 isLoggedIn 来自 /api/auth/verify，与本插件 verifySession 同一事实源）
  const isLogin = (): boolean => {
    return useAuth().isLoggedIn.value;
  };

  return {
    provide: {
      isLogin,
    },
  };
});
