import { getClientIp } from "#server/utils/client-ip";
import { hasRecentFailures } from "#server/utils/login-rate-limit";

/**
 * 登录页配置探针：返回本 IP 是否需要图形验证码（自适应 —— 无失败时零摩擦，被撞过才要求）。
 * 公开接口，但只暴露"本 IP 是否在失败窗口内"这一个布尔，且不含任何用户/会话数据。
 */
export default defineEventHandler(async event => {
  setResponseHeader(event, "Cache-Control", "no-store");
  const ip = getClientIp(event);
  return { captchaRequired: await hasRecentFailures(ip) };
});
