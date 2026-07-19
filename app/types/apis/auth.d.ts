/** /api/auth/verify GET：会话有效性校验，顺带返回系统是否已初始化可登录用户 */
export interface AuthVerifyResponse {
  valid: boolean;
  message?: string;
  user: {
    uid: number;
    name: string;
    nickname: string | null;
    mail: string | null;
    avatar: string | null;
  } | null;
  /** 系统是否已存在可登录用户（未登录时由 verify 查 users.count 得出；已登录恒 true）。原 /api/auth/status 探针接口已并入此处 */
  hasUser: boolean;
}
