import { createError, getQuery } from "h3";

import { assertPublicHttpUrl } from "#server/utils/urlGuard";

export default defineEventHandler(async event => {
  const { url } = getQuery(event);

  if (!url || typeof url !== "string") {
    throw createError({
      statusCode: 400,
      message: "缺少URL参数",
    });
  }

  // 校验 URL：仅 http/https，且不得解析到内网/环回地址（SSRF 防护）
  const validatedUrl = await assertPublicHttpUrl(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(validatedUrl.href, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91 Safari/537.36",
      },
      signal: controller.signal,
      // 拒绝重定向：公共 URL 可能被 30x 跳转到内网/环回地址，绕过上方 assertPublicHttpUrl 的 SSRF 防护
      redirect: "error",
    });

    clearTimeout(timeoutId);

    return {
      status: response.ok ? "up" : "down",
      message: response.ok ? "链接可访问" : `链接返回状态码: ${response.status}`,
      statusCode: response.status,
    };
  } catch (error) {
    console.error(error);
    clearTimeout(timeoutId);

    // AbortError（超时）
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        status: "down",
        message: "请求超时",
      };
    }

    // 其余错误（连接失败 / 被拒绝的重定向等）：只返回通用文案，
    // 完整细节已在上方 console.error 记录，不向客户端泄露内部错误信息
    return {
      status: "down",
      message: "链接不可访问",
    };
  }
});
