export default defineNuxtRouteMiddleware(async to => {
  // 跳过非 admin 路径
  if (!to.path.startsWith("/admin")) {
    return;
  }

  // 在服务器端，验证 session 有效性
  if (import.meta.server) {
    try {
      const { getUser } = await import("#server/lib/auth");
      const event = useRequestEvent();

      if (!event) {
        return navigateTo({ path: "/login", query: { to: to.fullPath } });
      }

      // 调用 getUser 验证 session
      // 如果 session 无效或不存在，getUser 会返回 null
      const user = await getUser(event);

      if (!user) {
        // session 无效，重定向到登录页
        // 这会在服务器端就拦截，不会渲染 AdminLayout
        return navigateTo({ path: "/login", query: { to: to.fullPath } });
      }

      // session 有效，继续渲染页面
      return;
    } catch {
      // 验证出错，重定向到登录页
      return navigateTo({ path: "/login", query: { to: to.fullPath } });
    }
  }

  // 在客户端，验证 session 有效性
  if (import.meta.client) {
    try {
      const res = await $fetch("/api/auth/verify");
      if (!res.valid) {
        return navigateTo({ path: "/login", query: { to: to.fullPath } });
      }
    } catch {
      return navigateTo({ path: "/login", query: { to: to.fullPath } });
    }
  }
});
