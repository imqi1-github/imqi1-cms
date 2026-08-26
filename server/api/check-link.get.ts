import { createError, getQuery } from "h3";

import { fetchPublicUrl } from "#server/utils/safe-fetch";

export default defineEventHandler(async event => {
  const { url } = getQuery(event);

  if (!url || typeof url !== "string") {
    throw createError({
      statusCode: 400,
      message: "缺少URL参数",
    });
  }

  try {
    // 安全外联：校验公网 + 钉定已校验 IP（封 DNS rebinding），统一 redirect:"error" 与 10s 超时
    const result = await fetchPublicUrl(
      url,
      async response => ({ up: response.ok, statusCode: response.status }),
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91 Safari/537.36",
        },
      },
      10000,
    );

    return {
      status: result.up ? "up" : "down",
      message: result.up ? "链接可访问" : `链接返回状态码: ${result.statusCode}`,
      statusCode: result.statusCode,
    };
  } catch (error) {
    console.error(error);

    // 非法/内网 URL 等业务校验错误（400）原样抛出，保持语义；其余（超时/连接失败/重定向被拒）→ "down"
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

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
