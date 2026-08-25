import { getMiniApiSecret, verifyMiniSignature } from "#server/utils/mini-auth";

/**
 * 小程序 API 鉴权中间件。
 *
 * 覆盖 `/api/mini/*` 全部方法（GET/POST 等），校验 HMAC-SHA256 签名 + 时间戳。
 * 与 referer-check 的取舍一致：
 *   - 开发环境（NODE_ENV=development）跳过，方便本地调试；
 *   - 生产环境未配置 MINI_API_SECRET 时 fail-closed（拒绝 401），避免未鉴权放行公开接口。
 *
 * CORS 预检（OPTIONS）不带签名头且由 [...].options.ts 单独处理，此处显式放行。
 */
export default defineEventHandler(event => {
  // 跳过开发环境
  if (process.env.NODE_ENV === "development") {
    return;
  }

  const path = event.node.req.url;

  // 仅拦截小程序接口
  if (!path || (path !== "/api/mini" && !path.startsWith("/api/mini/"))) {
    return;
  }

  // CORS 预检放行（交给 [...].options.ts 设置响应头）
  if ((event.node.req.method || "").toUpperCase() === "OPTIONS") {
    return;
  }

  // 未配置密钥时 fail-closed：生产环境拒绝，避免 /api/mini/* 未鉴权放行
  const secret = getMiniApiSecret();
  if (!secret) {
    console.error("[mini-auth] 缺少 MINI_API_SECRET，已拒绝访问 /api/mini/*（生产环境必须配置）");
    setResponseStatus(event, 401);
    return "";
  }

  const result = verifyMiniSignature(event, secret);
  if (!result.ok) {
    console.warn("[mini-auth] 鉴权失败:", result.reason, path);
    setResponseStatus(event, 401);
    return "";
  }
});
