/**
 * 管理操作审计：actor / action / target + 简短的 diff 摘要，仅 console 输出。
 *
 * 设计：
 *   - 走 `log.audit`，与 access/auth/external 等共享 [tag] ISO 格式前缀，便于 grep
 *   - actor 用 uid + name（auth 上下文已有；不在此重复做 getUser 调用 —— 调用方已鉴权）
 *   - target 一般是 cid / coid / mid 等数字 ID + 类型前缀（content/comment/category...）
 *   - diff 字段由调用方自己构造（before → after 的关键字段变化），传 string/JSON 即可
 *   - 不打 body / password / TOTP code / 完整 markdown 等敏感/大体积字段
 *
 * 用法：
 *   await logAdminAudit({
 *     actor: { uid: user.uid, name: user.name },
 *     action: "content.update",
 *     target: { type: "content", id: cid },
 *     diff: { status: "0→1" },
 *   });
 */
import { log } from "./log";

export interface AuditActor {
  uid: number;
  name?: string | null;
}

export type AuditAction =
  | "content.create"
  | "content.update"
  | "content.delete"
  | "comment.approve"
  | "comment.delete"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "tag.create"
  | "tag.update"
  | "tag.delete"
  | "link.approve"
  | "link.delete"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "settings.update"
  | "subscribe.refresh"
  | "2fa.enable"
  | "2fa.disable"
  | "2fa.trust-device"
  | "2fa.untrust-device"
  | "auth.login.success"
  | "auth.login.fail"
  | "auth.logout"
  | (string & {}); // 允许调用方自定义 action

export interface AuditTarget {
  type: string; // content / comment / category / tag / link / user / settings / etc.
  id?: string | number;
}

export interface AuditOptions {
  actor: AuditActor;
  action: AuditAction;
  target: AuditTarget;
  /** 简短 diff 摘要（key 形式如 "status=0→1" / "title.length=18→20"），避免 body 等敏感字段 */
  diff?: Record<string, unknown>;
  ip?: string | null;
}

export async function logAdminAudit(opts: AuditOptions): Promise<void> {
  log.audit("admin", {
    actor: { uid: opts.actor.uid, name: opts.actor.name ?? undefined },
    action: opts.action,
    target: opts.target.type + (opts.target.id !== undefined ? `#${opts.target.id}` : ""),
    ...(opts.diff ? { diff: opts.diff } : {}),
    ...(opts.ip ? { ip: opts.ip } : {}),
  });
}