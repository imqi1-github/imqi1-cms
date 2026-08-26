// 登录限流（server/utils/login-rate-limit）的类型（规则4：类型独立文件）。
export interface AttemptRecord {
  /** 当前统计窗口内的失败次数 */
  failures: number;
  /** 当前统计窗口起点（ms 时间戳） */
  windowStart: number;
  /** 锁定截止时间（ms 时间戳），0 表示未锁定 */
  lockedUntil: number;
}

export interface RateLimitResult {
  /** 是否处于锁定状态 */
  locked: boolean;
  /** 剩余锁定时长（ms），未锁定时为 0 */
  retryAfter: number;
}
