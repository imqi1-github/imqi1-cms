import { issueCaptcha } from "#server/utils/captcha";

/**
 * 生成并返回验证码图片（image/png 位图），同时通过 httpOnly cookie 下发 token。
 * 前端用 <img :src="/api/captcha/image"> 加载，点击刷新时附加时间戳避免缓存。
 * 注意：返回的是栅格化后的 PNG，答案不再以明文 <text> 暴露在响应中。
 */
export default defineEventHandler(async (event) => {
  const png = await issueCaptcha(event);

  setResponseHeader(event, "Content-Type", "image/png");
  setResponseHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate");

  return png;
});
