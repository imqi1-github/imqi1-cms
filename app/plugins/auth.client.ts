export default defineNuxtPlugin(() => {
  const isLogin = (): boolean => {
    return useCookie('session').value !== undefined
  }

  /**
   * 验证会话是否有效（检查是否在其他设备登录）
   * 返回 true 表示有效，false 表示已失效
   */
  const verifySession = async (): Promise<boolean> => {
    try {
      const res = await $fetch('/api/auth/verify')
      return (res as any).valid === true
    } catch {
      return false
    }
  }

  // 暴露到 window
  window.isLogin = isLogin

  return {
    provide: {
      isLogin,
      verifySession,
    },
  }
})
