export default defineNuxtRouteMiddleware(async (to, from) => {
  // 跳过非 admin 路径
  if (!to.path.startsWith('/admin')) {
    return
  }

  // 在服务器端，通过 API 验证 session
  if (import.meta.server) {
    try {
      // 在服务器端，我们需要直接检查 event 而不是 useCookie
      // 但由于中间件运行在渲染之前，我们暂时使用简单的 cookie 检查
      const sessionCookie = useCookie('session')
      const hasCookie = sessionCookie.value !== undefined && sessionCookie.value !== ''

      if (!hasCookie) {
        return navigateTo('/login?to=' + encodeURIComponent(to.path))
      }

      // TODO: 在服务器端验证 session 有效性
      // 目前先通过简单的 cookie 检查，后续可以改进为调用 getUser(event)
    } catch {
      return navigateTo('/login?to=' + encodeURIComponent(to.path))
    }
  }

  // 在客户端，验证 session 有效性
  if (import.meta.client) {
    try {
      const res = await $fetch('/api/auth/verify')
      if (!(res as any).valid) {
        return navigateTo('/login?to=' + encodeURIComponent(to.path))
      }
    } catch {
      return navigateTo('/login?to=' + encodeURIComponent(to.path))
    }
  }
})
