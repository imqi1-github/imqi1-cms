/**
 * 错误监控（无 DB）：仅 console + 文件日志 + 邮件通知。
 *
 * 邮件模板与日志格式对齐（中文标签 + 一致字段），让运维侧从日志 → 邮件快速对位。
 */
import { createHash } from "node:crypto";

import { sendMail } from "./mail";
import { redis } from "./redis";
import { getSiteSettings } from "./siteSettings";
import { log } from "./log";

export type ErrorLevel = "error" | "warning" | "info";
export type ErrorSource = "server" | "client";

export interface ErrorReportInput {
  source: ErrorSource;
  level: ErrorLevel;
  message: string;
  stack?: string | null;
  url?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | null;
}

export interface ErrorReportResult {
  notified: boolean;
  suppressed?: boolean;
}

function fingerprint(input: ErrorReportInput): string {
  return createHash("sha256")
    .update(`${input.level}:${(input.message ?? "").slice(0, 100)}`)
    .digest("hex")
    .slice(0, 32);
}

const NOTIFY_DEDUPE_WINDOW_SEC = 300;

export async function reportError(input: ErrorReportInput): Promise<ErrorReportResult | null> {
  log.monitor("接收", {
    来源: input.source,
    级别: input.level,
    消息: input.message.slice(0, 200),
    路径: input.url ?? undefined,
    IP: input.ip ?? undefined,
  });

  let suppressed = false;
  if (redis) {
    try {
      const key = `error:notify:${fingerprint(input)}`;
      const recent = await redis.incr(key);
      if (recent === 1) await redis.expire(key, NOTIFY_DEDUPE_WINDOW_SEC);
      if (recent > 1) suppressed = true;
    } catch (error) {
      console.error("[error-report] 抑制检查失败:", error);
    }
  }

  if (suppressed) {
    return { notified: false, suppressed: true };
  }

  const notified = await sendErrorNotification(input).catch(error => {
    console.error("[error-report] 邮件发送失败:", error);
    return false;
  });

  if (notified) {
    log.monitor("已通知", {
      来源: input.source,
      级别: input.level,
      消息: input.message.slice(0, 100),
    });
  }
  return { notified, suppressed: false };
}

/** 来源/级别 → 中文标签（与 log.ts 的 LOG_TAG_LABELS 风格对齐） */
const SOURCE_LABELS: Record<ErrorSource, string> = {
  server: "服务端",
  client: "客户端",
};
const LEVEL_LABELS: Record<ErrorLevel, string> = {
  error: "错误",
  warning: "警告",
  info: "信息",
};

async function sendErrorNotification(input: ErrorReportInput): Promise<boolean> {
  const settings = await getSiteSettings();
  const adminEmail = settings?.adminEmail;
  if (!adminEmail || settings?.notifyAdmin === false) return false;

  const siteName = settings?.siteName || "imqi1-cms";
  const levelText = LEVEL_LABELS[input.level] ?? input.level;
  const sourceText = SOURCE_LABELS[input.source] ?? input.source;
  const subject = `[${siteName}] ${levelText}通知 · ${sourceText} · ${input.message.slice(0, 50)}`;
  const tsDisplay = new Date().toISOString().replace("T", " ").slice(0, 19);

  const stackBlock = input.stack
    ? `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-all;margin:8px 0 0;">${escapeHtml(input.stack.slice(0, 3000))}</pre>`
    : `<p style="color:#888;margin:8px 0 0;font-size:12px;">(无堆栈信息)</p>`;

  const contextBlock = input.context
    ? `<pre style="background:#f8f8f8;padding:10px;border-radius:6px;font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-all;margin:8px 0 0;">${escapeHtml(JSON.stringify(input.context, null, 2))}</pre>`
    : "";

  // 直接写内嵌 HTML（不依赖 mail.ts 的私有 createEmailTemplate，避免跨包引用私有成员）
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:20px;color:#1f2937;">
      <h2 style="margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid #e5e7eb;font-size:18px;">
        ${escapeHtml(levelText)} · ${escapeHtml(sourceText)}
        <span style="margin-left:8px;font-size:13px;font-weight:400;color:#6b7280;">${escapeHtml(siteName)}</span>
      </h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:90px;">级别</td><td style="padding:6px 0;"><strong style="color:${levelText === "错误" ? "#dc2626" : "#2563eb"};">${escapeHtml(levelText)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">来源</td><td style="padding:6px 0;">${escapeHtml(sourceText)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">时间</td><td style="padding:6px 0;">${escapeHtml(tsDisplay)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">请求路径</td><td style="padding:6px 0;">${escapeHtml(input.url ?? "(未知)")}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">消息</td><td style="padding:6px 0;"><strong>${escapeHtml(input.message)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">客户端 IP</td><td style="padding:6px 0;">${escapeHtml(input.ip ?? "(未知)")}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">UA</td><td style="padding:6px 0;">${escapeHtml((input.userAgent ?? "").slice(0, 200))}</td></tr>
      </table>
      ${input.context ? `
      <h3 style="margin:18px 0 6px;font-size:14px;color:#374151;">上下文</h3>
      ${contextBlock}
      ` : ""}
      <h3 style="margin:18px 0 6px;font-size:14px;color:#374151;">堆栈</h3>
      ${stackBlock}
      <p style="margin-top:20px;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">
        同 (级别+消息) 5 分钟内只会再发一封；详细日志见容器内 <code>logs/监控/${todayKey()}.log</code>。
      </p>
    </div>
  `;

  return sendMail({ to: adminEmail, subject, html });
}

/** 与 log.ts dateKey 一致（YYYY-MM-DD），避免重复实现 */
function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}