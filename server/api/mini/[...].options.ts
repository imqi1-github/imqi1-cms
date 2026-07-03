export default defineEventHandler(event => {
  // 小程序端为公开跨源接口：显式放行方法与自定义请求头
  // （含 X-Client-Platform，后端据此把评论 agent 记为 "Mini"）。
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Client-Platform",
    "Access-Control-Max-Age": "86400",
  });

  setResponseStatus(event, 204);

  return "";
});
