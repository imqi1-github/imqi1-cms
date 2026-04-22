/**
 * 防止反向代理插件
 * 仅在生产环境且配置了 ROOT_DOMAIN 时启用
 * 如果当前访问域名与 ROOT_DOMAIN 不匹配，则强制跳转
 */
export default defineNuxtPlugin(() => {
  // 只在生产环境启用
  if (import.meta.dev) {
    return;
  }

  const config = useRuntimeConfig();
  const rootDomain = config.public.rootDomain as string;

  // 如果未配置 ROOT_DOMAIN，则不启用防护
  if (!rootDomain) {
    return;
  }

  // 在客户端执行域名检查
  if (import.meta.client) {
    // 检查当前域名
    const currentHost = window.location.hostname;

    // 如果当前域名与 ROOT_DOMAIN 不匹配，则强制跳转
    if (currentHost !== rootDomain) {
      // 构建目标 URL
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const currentHash = window.location.hash;

      const targetUrl = `https://${rootDomain}${currentPath}${currentSearch}${currentHash}`;

      // 强制跳转到目标域名
      window.location.href = targetUrl;
    }
  }
});
