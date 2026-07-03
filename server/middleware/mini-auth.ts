import { getMiniApiSecret, verifyMiniSignature } from "#server/utils/mini-auth";

/**
 * 小程序 API 鉴权中间件。
 *
 * 覆盖 `/api/mini/*` 全部方法（GET/POST 等），校验 HMAC-SHA256 签名 + 时间戳。
 * 与 referer-check 的取舍一致：
 *   - 开发环境（NODE_ENV=development）跳过，方便本地调试；
 *   - 未配置 MINI_API_SECRET 时放行，兼容旧部署/未配置场景，仅在配置了密钥后才强制校验。
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

  // 未配置密钥时不启用鉴权（兼容旧部署）
  const secret = getMiniApiSecret();
  if (!secret) {
    return;
  }

  const result = verifyMiniSignature(event, secret);
  if (!result.ok) {
    console.warn("[mini-auth] 鉴权失败:", result.reason, path);
    setResponseStatus(event, 401);
    return "";
  }
});
