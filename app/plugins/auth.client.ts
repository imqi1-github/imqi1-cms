export default defineNuxtPlugin(() => {
  const isLogin = (): boolean => {
    return useCookie('session').value !== undefined
  }

  // 暴露到 window
  window.isLogin = isLogin

  return {
    provide: {
      isLogin,
    },
  }
})
