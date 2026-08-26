// 小程序签名校验（server/utils/mini-auth）的返回契约（规则4：类型独立文件）。
export interface MiniAuthResult {
  ok: boolean;
  /** 校验失败原因，仅用于服务端日志，不回传给客户端。 */
  reason?: string;
}
