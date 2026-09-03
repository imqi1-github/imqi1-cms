import QRCode from "qrcode";

/**
 * 通用二维码生成（GET）：把 query 里的 text 渲染成 PNG 返回。
 * 前端直接 `<img :src="/api/qr?text=<encodeURIComponent(url)>">` 使用，无需 JS 再取。
 * 用途：文章分享访、足迹位置在高德打开、订阅 RSS 等。
 * 只渲染文本为图片，不发起任何服务端请求（无 SSRF 面）；限制长度与字符集避免滥用。
 */
const MAX_TEXT_LEN = 1000;

/** 逐字符检查控制字符（C0 + DEL），避免复用正则触发 no-control-regex 且不受字面控制字符影响 */
function hasControlChar(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300");

  const raw = getQuery(event).text;
  const text = typeof raw === "string" ? raw : undefined;

  if (!text || !text.trim() || text.length > MAX_TEXT_LEN) {
    throw createError({ statusCode: 400, message: "缺少或过长的 text 参数" });
  }

  if (hasControlChar(text)) {
    throw createError({ statusCode: 400, message: "text 含非法字符" });
  }

  const png = await QRCode.toBuffer(text.trim(), { errorCorrectionLevel: "M", margin: 1, width: 220 });
  setHeader(event, "Content-Type", "image/png");
  return png;
});
