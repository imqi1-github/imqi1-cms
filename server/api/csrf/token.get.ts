import { ensureCsrfToken } from "#server/utils/csrf";

export default defineEventHandler((event) => {
  // 确保存在 CSRF token，如果不存在则创建
  const token = ensureCsrfToken(event);

  return {
    code: 200,
    data: {
      token,
    },
  };
});
