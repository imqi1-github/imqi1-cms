import QRCode from "qrcode";

import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";
import { generateTOTPSecret, otpauthUrl } from "#server/utils/totp";

/**
 * 开始启用两步验证（已登录 + CSRF）：
 * 生成新 base32 密钥并暂存到 users.totp_secret（尚未启用）。
 * 返回 otpauth URI（手动/复制用）与把该 URI 渲染成的二维码 dataURL（扫码录入用）。
 * 用户完成录入后调 enable 用当前动态码确认，此刻才真正启用。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "未登录" });
  }

  const body = await readBody(event).catch(() => ({}));
  if (!validateCsrfToken(event, body?.csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  const secret = generateTOTPSecret();
  await prisma.users.update({
    where: { uid: user.uid },
    data: { totp_secret: secret, totp_enabled: false },
  });

  const uri = otpauthUrl({ secret, account: user.name, issuer: "imqi1" });
  // errorCorrectionLevel: "M" 兼顾容错与图案复杂度；margin/w 控制留白与尺寸
  const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 });

  return {
    enabled: false,
    secret,
    otpauthUrl: uri,
    qrDataUrl,
  };
});
