/**
 * 轻量结构化日志：分类标签 + ISO 时间戳 + 自由字段，**双写到 console + 文件**。
 *
 * 文件落地结构（用户约定）：
 *   - 根目录由 `LOG_DIR` 环境变量控制，默认 `./logs/`
 *   - **每类别一个子目录、子目录内每天一个文件**：`logs/access/2026-05-10.log`
 *     —— 与历史 mail.ts 的 `logs/mail/{date}.log` 习惯一致；按天分文件便于归档 + logrotate
 *   - 子目录名为英文 category（windows/工具链对中文路径友好性差）
 *   - **行内标签用中文**（如 `[访问] [请求]`）让现场排障可读性更高
 *   - msg / kv 内容由调用方决定（保持原有英文 / 中文自由）
 *
 * 设计：
 *   - 文件落地：**best-effort**，appendFile 失败仅 console.error，不抛（避免日志本身再抛造成无限循环）
 *   - **console 同步打 + 文件异步追加**：调试期到终端看，部署期重定向 stdout 或扫 logs/* 离线分析
 *   - 环境变量 `LOG_DIR` 覆盖默认 `./logs`，与 docker-compose 的 `${LOGS_DIR}` 挂卷对应
 *   - 不引入 log 库（pino/winston），用户明确不要复杂日志
 */
import { appendFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { LOG_LINE_FORMAT, LOG_TAG_LABELS } from "#shared/constants";

const DEFAULT_LOG_DIR = "./logs";
const LOG_DIR = resolve(process.env.LOG_DIR || DEFAULT_LOG_DIR);

/** 时间戳：YYYY-MM-DD HH:mm:ss.SSS，用本地时区（dev 走主机时区、prod 容器 UTC 时显示容器时间）。
 * 不引入 LOG_TIMEZONE 等额外环境变量 —— 项目内只用 LOG_DIR 一项配置日志路径。
 * 用户只要保证容器 / 主机的本地时区符合预期（dev 东八区 OK、prod 容器 UTC 也是显式期望）。
 */
function fmtTs(d: Date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** 当天文件日期键：YYYY-MM-DD；与 fmtTs 同时区（都是 host/容器 time zone） */
function dateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stringifyFields(fields?: Record<string, unknown>): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    parts.push(`${k}=${s.includes(" ") || s.includes("\n") ? JSON.stringify(s) : s}`);
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

/** 缓存：{ dir -> mkdir promise }。同一进程内同目录不重复 mkdir */
const dirInitCache = new Map<string, Promise<void>>();

async function ensureDir(dir: string): Promise<void> {
  let p = dirInitCache.get(dir);
  if (!p) {
    p = mkdir(dir, { recursive: true })
      .then(() => undefined)
      .catch(err => {
        dirInitCache.delete(dir);
        throw err;
      });
    dirInitCache.set(dir, p);
  }
  await p;
}

/**
 * 把一行日志写到 `{LOG_DIR}/{category}/{date}.log`。
 * 失败 → console.error，不抛。
 */
async function writeLogFile(category: string, line: string): Promise<void> {
  const dir = join(LOG_DIR, category);
  const file = join(dir, `${dateKey()}.log`);
  try {
    await ensureDir(dir);
    await appendFile(file, line + "\n", "utf8");
  } catch (error) {
    console.error(`[log] 写日志文件失败 (${category}):`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 拿调用者文件:行号 —— 走 Error().stack 拿第一帧非本文件。
 * 性能约 1~2μs/次；只在 logWithCaller() 走，不影响普通 log.xxx()。
 */
function captureCaller(): string {
  const stack = new Error().stack ?? "";
  const lines = stack.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("server/utils/log.ts")) continue;
    const m = /\s*at\s+(?:.+\s\()?(.+?):(\d+):\d+\)?/.exec(line);
    if (m) {
      const filePath = (m[1] ?? "").replace(/^.*[\\/]/, "");
      return `${filePath}:${m[2] ?? "?"}`;
    }
  }
  return ":-";
}

/** category → 中文标签（取不到原文） */
function labelOf(category: string): string {
  return LOG_TAG_LABELS[category] ?? category;
}

interface EmitOptions {
  level: "info" | "warn" | "error";
  tag: string;
  msg: string;
  fields?: Record<string, unknown>;
  caller?: string;
}

/**
 * 公共写入：先 console，再异步落盘。console 立即可见，文件后台追加。
 * `{tag}` 在落地行里渲染为中文标签。
 */
function emit(category: string, opts: EmitOptions): void {
  const ts = fmtTs();
  const kv = stringifyFields(opts.fields);
  const line = LOG_LINE_FORMAT.replace("{ts}", ts)
    .replace("{tag}", labelOf(opts.tag))
    .replace("{level}", opts.level.toUpperCase())
    .replace("{msg}", opts.msg)
    .replace("{caller}", opts.caller ?? "")
    .replace("{kv}", kv);
  if (opts.level === "error") console.error(line);
  else if (opts.level === "warn") console.warn(line);
  else console.log(line);

  void writeLogFile(category, line);
}

/**
 * 各分类 logger。
 *
 * 分类 = 子目录名（不带日期）。命名尽量稳定，避免历史日志散乱。
 */
export const log = {
  /** 每个 API 请求 1 行 */
  access: (msg: string, fields?: Record<string, unknown>) => emit("access", { level: "info", tag: "access", msg, fields }),
  /** 管理操作审计 */
  audit: (msg: string, fields?: Record<string, unknown>) => emit("audit", { level: "info", tag: "audit", msg, fields }),
  /** 认证事件 */
  auth: (msg: string, fields?: Record<string, unknown>) => emit("auth", { level: "info", tag: "auth", msg, fields }),
  /** 第三方服务调用（mail/cos/github/amap/captcha） */
  external: (msg: string, fields?: Record<string, unknown>) => emit("external", { level: "info", tag: "external", msg, fields }),
  /** ISR 缓存失效 */
  cache: (msg: string, fields?: Record<string, unknown>) => emit("cache", { level: "info", tag: "cache", msg, fields }),
  /** 限流命中 */
  rateLimit: (msg: string, fields?: Record<string, unknown>) => emit("ratelimit", { level: "warn", tag: "ratelimit", msg, fields }),
  /** 定时任务 */
  cron: (msg: string, fields?: Record<string, unknown>) => emit("cron", { level: "info", tag: "cron", msg, fields }),
  /** 错误监控自身（异常入站 + 邮件发送结果） */
  monitor: (msg: string, fields?: Record<string, unknown>) => emit("monitor", { level: "info", tag: "monitor", msg, fields }),
  /** 通用 —— 没有合适分类时的兜底 */
  app: (msg: string, fields?: Record<string, unknown>) => emit("app", { level: "info", tag: "app", msg, fields }),
  /** error 级别 */
  error: (msg: string, fields?: Record<string, unknown>) => emit("app", { level: "error", tag: "app", msg, fields }),
};

/**
 * 带调用者文件:行号 的 log —— 性能稍高（captureStackTrace）。
 * 一般在错误/关键事件时用；常规 log.xxx() 不带 caller 字段开销。
 */
export function logWithCaller(
  category: keyof typeof log,
  level: "info" | "warn" | "error",
  msg: string,
  fields?: Record<string, unknown>,
): void {
  const caller = captureCaller();
  emit(category, { level, tag: category, msg, fields, caller });
}

/** 当前实际日志目录（暴露供测试 / 调试使用） */
export const LOG_DIR_RESOLVED = LOG_DIR;