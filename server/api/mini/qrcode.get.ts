import { generateMiniProgramCode } from "#server/utils/wechat-mini";

/**
 * 文章小程序码（GET ?cid=<内容id>）：调微信 getwxacodeunlimit 返回小程序码 PNG。
 * 未配置 WECHAT_MINI_* 时返回 404（前端据此隐藏「小程序看」入口）。
 */
export default defineEventHandler(async event => {
  const cid = Number(getQuery(event).cid);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({ statusCode: 400, message: "无效 cid" });
  }

  try {
    // scene 仅支持数字/字母/下划线等(微信限制≤32字符)，用纯 cid 字符串
    const png = await generateMiniProgramCode(String(cid), "pages/content/detail");
    setHeader(event, "Content-Type", "image/png");
    setHeader(event, "Cache-Control", "public, max-age=600");
    return png;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("未配置")) {
      throw createError({ statusCode: 404, message: "未配置微信小程序凭据" });
    }
    console.error("[mini/qrcode]", msg);
    throw createError({ statusCode: 502, message: "小程序码生成失败" });
  }
});
