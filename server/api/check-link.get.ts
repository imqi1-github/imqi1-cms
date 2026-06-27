import { createError, getQuery } from "h3";

export default defineEventHandler(async event => {
  const { url } = getQuery(event);

  if (!url || typeof url !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "缺少URL参数",
    });
  }

  // 验证 URL
  let validatedUrl: URL;
  try {
    validatedUrl = new URL(url);
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 400,
      statusMessage: "无效的URL格式",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(validatedUrl.href, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91 Safari/537.36",
      },
      signal: controller.signal,
      redirect: "follow",
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

    // 标准 Error
    if (error instanceof Error) {
      return {
        status: "down",
        message: `链接不可访问: ${error.message}`,
      };
    }

    // 兜底
    return {
      status: "down",
      message: `链接不可访问: ${String(error)}`,
    };
  }
});
