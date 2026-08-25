import { setResponseHeader } from "h3";

import { ensureCsrfToken } from "#server/utils/csrf";

export default defineEventHandler((event) => {
  // CSRF token 属 per-user 敏感数据，禁止任何缓存
  setResponseHeader(event, "Cache-Control", "no-store");

  // 确保存在 CSRF token，如果不存在则创建
  const token = ensureCsrfToken(event);

  return {
    code: 200,
    data: {
      token,
    },
  };
});
