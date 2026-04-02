export default defineNuxtRouteMiddleware((to, from) => {
  const isLoggedIn = useCookie('session').value !== undefined

  // 情况1: 用户已登录，访问 /login，跳转到 /admin
  if (to.path === '/login' && isLoggedIn) {
    return navigateTo('/admin')
  }

  // 情况2: 用户未登录，访问 /admin/*，跳转到 /login，并带上 to 参数
  if (to.path.startsWith('/admin') && !isLoggedIn) {
    return navigateTo({
      path: '/login',
      query: { to: to.fullPath },
    })
  }
})
