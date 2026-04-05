export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const cdnURL = config.public.cdnURL as string;

  // 只在生产环境或明确配置了 cdnURL 时使用 CDN
  if (cdnURL && process.env.NODE_ENV === "production") {
    // 移除默认的 fonts.css 链接
    const defaultLink = document.querySelector('link[href="/fonts/font.css"]');
    if (defaultLink) {
      defaultLink.remove();
    }

    // 动态添加 fonts.css 的 CDN 链接
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${cdnURL}/fonts/font.css`;
    document.head.appendChild(link);
  }
});
