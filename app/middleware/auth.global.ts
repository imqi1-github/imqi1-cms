export default defineNuxtRouteMiddleware((to, from) => {
  const sessionCookie = useCookie('session')
  const hasCookie = sessionCookie.value !== undefined && sessionCookie.value !== ''

  // 访问 /admin/* 页面需要登录
  if (to.path.startsWith('/admin')) {
    if (!hasCookie) {
      return navigateTo('/login?to=' + encodeURIComponent(to.path))
    }
  }
})
