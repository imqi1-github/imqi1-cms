import { createError, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  try {
    const { url } = getQuery(event);

    if (!url || typeof url !== 'string') {
      throw createError({
        statusCode: 400,
        message: '缺少URL参数',
      });
    }

    // 验证URL格式
    let validatedUrl: URL;
    try {
      validatedUrl = new URL(url);
    } catch {
      throw createError({
        statusCode: 400,
        message: '无效的URL格式',
      });
    }

    // 检测URL是否可访问
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    try {
      const response = await fetch(validatedUrl.href, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      // 检查响应状态
      if (response.ok) {
        return {
          status: 'up',
          message: '链接可访问',
          statusCode: response.status,
        };
      } else {
        return {
          status: 'down',
          message: `链接返回状态码: ${response.status}`,
          statusCode: response.status,
        };
      }
    } catch (error: any) {
      clearTimeout(timeoutId);

      return {
        status: 'down',
        message: `链接不可访问: ${error.message || '未知错误'}`,
      };
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: error.message || '检测失败',
    });
  }
});
