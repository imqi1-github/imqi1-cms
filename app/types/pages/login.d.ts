// 在组件挂载时获取 CSRF token 并检查登录状态
export type ApiError = { statusCode?: number; message?: string; data?: { message?: string } };