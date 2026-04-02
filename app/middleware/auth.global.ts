export default defineNuxtRouteMiddleware((to, from) => {
  const sessionCookie = useCookie('session')
  const isLoggedIn = sessionCookie.value !== undefined && sessionCookie.value !== ''

  console.log('[auth middleware] path:', to.path, 'isLoggedIn:', isLoggedIn, 'cookie:', sessionCookie.value)

  // 情况1: 用户已登录，访问 /login，跳转到 /admin
  if (to.path === '/login' && isLoggedIn) {
    console.log('[auth middleware] 已登录访问登录页，跳转到 /admin')
    return navigateTo('/admin')
  }

  // 情况2: 用户未登录，访问 /admin/*，跳转到 /login?to=...
  if (!isLoggedIn && to.path.startsWith('/admin')) {
    console.log('[auth middleware] 未登录访问后台，跳转到 /login?to=' + to.path)
    return navigateTo('/login?to=' + encodeURIComponent(to.path))
  }
})
