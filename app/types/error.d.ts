export interface ErrorResponse {
  __handled__?: boolean;
  _data?: {
    message?: string;
  };
}

export interface HandledError {
  __handled__?: boolean;
  response?: ErrorResponse;
}

export type ApiError = { statusCode?: number; message?: string; data?: { message?: string; captchaRequired?: boolean } };

// 全局错误处理器提取业务错误信息的 shape（原内联在 app/plugins/error-handler.ts，挪到此）。
export interface ErrorShape {
  message?: string;
  statusMessage?: string;
  statusCode?: number;
  status?: number;
  data?: { message?: string };
  response?: { _data?: { message?: string } };
}
