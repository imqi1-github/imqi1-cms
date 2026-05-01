export default defineEventHandler(event => {
  // 跳过开发环境
  if (process.env.NODE_ENV === "development") {
    return;
  }

  // 非 API 端点跳过
  const path = event.node.req.url;
  if (!path?.startsWith("/api/")) {
    return;
  }

  // 跳过本地/服务端请求（SSR 内部请求）
  const host = event.node.req.headers.host || "";
  const referer = event.node.req.headers.referer;

  // 如果没有 referer，但请求来自本地，则允许（SSR 请求）
  if (!referer && (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.includes(".local"))) {
    return;
  }

  // 允许的referer域名（从环境变量读取，逗号分隔）
  const allowedDomains = process.env.ALLOWED_REFERER_DOMAINS
    ? process.env.ALLOWED_REFERER_DOMAINS.split(",").map(d => d.trim())
    : ["imqi1.com"];

  // 如果没有referer，拒绝请求
  if (!referer) {
    setResponseStatus(event, 403);
    return { message: "Forbidden" };
  }

  try {
    // 解析referer URL
    const refererUrl = new URL(referer);
    const refererDomain = refererUrl.hostname;

    // 检查是否在允许列表中
    if (!allowedDomains.includes(refererDomain)) {
      setResponseStatus(event, 403);
      return { message: "Invalid referer domain" };
    }
  } catch (error) {
    // 解析失败时，拒绝请求
    console.warn("referer 解析失败:", referer, error);
    setResponseStatus(event, 403);
    return { message: "Invalid referer format" };
  }
});
