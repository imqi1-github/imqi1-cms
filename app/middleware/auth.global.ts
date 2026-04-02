export default defineNuxtRouteMiddleware((to, from) => {
  const sessionCookie = useCookie('session')
  const isLoggedIn = sessionCookie.value !== undefined && sessionCookie.value !== ''

  // 情况1: 用户已登录，访问 /login，跳转到 /admin
  if (to.path === '/login' && isLoggedIn) {
    return navigateTo('/admin')
  }

  // 情况2: 用户未登录，访问 /admin/*，跳转到 /login?to=...
  if (!isLoggedIn && to.path.startsWith('/admin')) {
    return navigateTo('/login?to=' + encodeURIComponent(to.path))
  }
})
