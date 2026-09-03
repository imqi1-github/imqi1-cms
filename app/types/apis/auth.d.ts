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

/** 登录成功返回的用户信息 */
export interface LoginUser {
  uid: number;
  name: string;
  nickname: string | null;
  mail: string | null;
  avatar: string | null;
}

/** /api/auth/login POST：成功 or 需要第二因素（pending2FA，携带 challenge 供 /api/auth/2fa/verify） */
export type LoginResponse =
  | { success: true; user: LoginUser }
  | { success: false; pending2FA: true; challenge: string };

/** /api/auth/login-config GET */
export interface LoginConfigResponse {
  /** 本 IP 是否需图形验证码（自适应：被撞过才要求） */
  captchaRequired: boolean;
}

/** /api/auth/2fa/status GET */
export interface TwoFactorStatusResponse {
  enabled: boolean;
  /** 已生成密钥但尚未确认启用（setup 之后、enable 之前） */
  pendingSetup: boolean;
}

/** /api/auth/2fa/setup POST */
export interface TwoFactorSetupResponse {
  enabled: false;
  secret: string;
  otpauthUrl: string;
  /** 二维码 PNG dataURL（扫码录入，亦可手动复制 secret） */
  qrDataUrl: string;
}

