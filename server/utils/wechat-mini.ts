/**
 * 微信小程序码服务端封装（`文章小程序端看`）。
 *
 * 依赖 .env 的 WECHAT_MINI_APPID / WECHAT_MINI_SECRET；未配置时 generateMiniProgramCode 抛错，
 * 由 /api/qrcode 转为 404（前端据此自动隐藏入口）。access_token 内存缓存（微信 7200s 有效期）。
 * 只做服务端外联，token/secret 不外泄。
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

function isConfigured(): boolean {
  return Boolean(process.env.WECHAT_MINI_APPID && process.env.WECHAT_MINI_SECRET);
}

/** 获取 access_token（带内存缓存，过期前 60s 提前刷新） */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const appid = process.env.WECHAT_MINI_APPID!;
  const secret = process.env.WECHAT_MINI_SECRET!;
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`,
  );
  const data = (await res.json()) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
  if (!data.access_token) {
    throw new Error(`微信 access_token 失败: ${JSON.stringify(data)}`);
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000 };
  return data.access_token;
}

/**
 * 生成小程序码（getwxacodeunlimit）：scene 携带文章 cid，page 指向 mini 详情页。
 * 返回 PNG Buffer；WeChat 返回 JSON 错误体时抛错。
 */
export async function generateMiniProgramCode(scene: string, page: string): Promise<Buffer> {
  if (!isConfigured()) {
    throw new Error("未配置微信小程序凭据 WECHAT_MINI_APPID/SECRET");
  }

  const token = await getAccessToken();
  const res = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene, page, check_path: false, env_version: "release", width: 280 }),
  });

  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    const err = (await res.json()) as { errcode?: number; errmsg?: string };
    throw new Error(`微信小程序码失败: ${JSON.stringify(err)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
