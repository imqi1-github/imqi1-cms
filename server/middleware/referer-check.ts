export default defineEventHandler(event => {
  // 跳过开发环境
  if (process.env.NODE_ENV === "development") {
    return;
  }

  // 跳过admin API（后台API）
  const path = event.node.req.url;
  if (path?.startsWith("/api/admin/")) {
    return;
  }

  // 允许的referer域名
  const allowedDomains = ["imqi1.com"];

  // 获取referer头
  const referer = event.node.req.headers.referer;

  // 如果没有referer，允许请求（某些浏览器或工具可能不发送referer）
  if (!referer) {
    return
  }

  try {
    // 解析referer URL
    const refererUrl = new URL(referer);
    const refererDomain = refererUrl.hostname;

    // 检查是否在允许列表中
    if (!allowedDomains.includes(refererDomain)) {
      throw createError({
        statusCode: 403,
        message: "Invalid referer",
      });
    }
  } catch (error) {
    // 解析失败时，允许请求
    return;
  }
});
