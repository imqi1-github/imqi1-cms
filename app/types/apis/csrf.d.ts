/**
 * CSRF 相关类型定义
 */

/** CSRF Token API 响应 */
export interface CsrfTokenResponse {
  code: 200;
  data: {
    token: string;
  };
}