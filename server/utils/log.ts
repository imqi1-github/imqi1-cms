/**
 * 轻量结构化日志：分类标签 + ISO 时间戳 + 自由字段，**双写到 console + 文件**。
 *
 * 文件落地结构（用户约定）：
 *   - 根目录默认取 site.config `logs.dir`，`LOGS_DIR` 环境变量优先（Docker 挂卷 / 测试指 tmpdir）
 *   - **每类别一个子目录、子目录内每天一个文件**：`logs/access/2026-05-10.log`
 *     —— 与历史 mail.ts 的 `logs/mail/{date}.log` 习惯一致；按天分文件便于归档 + logrotate
 *   - **单文件超过 site.config `logs.maxFileSizeMb` 后切分**：`{date}.1.log`、`{date}.2.log`…
 *     防单日日志爆量撑爆磁盘；分片序号记录在内存，进程重启后 stat 接续
 *   - 超过 site.config `logs.retentionDays` 的旧文件在新的一天首次写入时顺手清理
 *   - 子目录名为英文 category（windows/工具链对中文路径友好性差）
 *   - **行内标签用中文**（如 `[访问] [请求]`）让现场排障可读性更高；行格式见 site.config `logs.lineFormat`
 *   - msg / kv 内容由调用方决定（保持原有英文 / 中文自由）
 *
 * 设计：
 *   - 文件落地：**best-effort**，appendFile 失败仅 console.error，不抛（避免日志本身再抛造成无限循环）
 *   - **console 同步打 + 文件异步追加**：调试期到终端看，部署期重定向 stdout 或扫 logs/* 离线分析
 *   - 总开关 / 分类开关在 site.config `logs`：关闭的只打 console 不落盘
 *   - 同类别写入按 promise 链串行：切分判定 / 序号推进 / 字节数统计不并发竞态，行序也稳定
 *   - 不引入 log 库（pino/winston），用户明确不要复杂日志
 */
import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { siteConfig } from "~~/site.config";
import { LOG_TAG_LABELS } from "#shared/constants";

const LOGS_DIR = resolve(process.env.LOGS_DIR || siteConfig.logs.dir || "./logs");

/** 时间戳：YYYY-MM-DD HH:mm:ss.SSS，用本地时区（dev 走主机时区、prod 容器 UTC 时显示容器时间）。
 * 不引入 LOG_TIMEZONE 等额外环境变量 —— 项目内只用 LOGS_DIR 一项配置日志路径。
 * 用户只要保证容器 / 主机的本地时区符合预期（dev 东八区 OK、prod 容器 UTC 也是显式期望）。
 */
function fmtTs(d: Date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** 当天文件日期键：YYYY-MM-DD；与 fmtTs 同时区（都是 host/容器 time zone）。导出给 MCP 运维工具定位当天日志文件 */
export function dateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 分片文件名：seq 0 = `{date}.log`（兼容无切分的历史命名），之后 `{date}.{seq}.log` */
function shardName(date: string, seq: number): string {
  return seq === 0 ? `${date}.log` : `${date}.${seq}.log`;
}

/** 文件名 → 当天分片序号；不是该天的文件返回 -1 */
function shardSeq(date: string, name: string): number {
  if (name === `${date}.log`) return 0;
  const m = new RegExp(`^${date}\\.(\\d+)\\.log$`).exec(name);
  return m ? Number(m[1]) : -1;
}

/** 从目录文件名列表挑出某天的分片并按序号升序返回（MCP get_recent_logs 合并全天日志用） */
export function dayShardFiles(day: string, names: string[]): string[] {
  return names
    .map(name => ({ name, seq: shardSeq(day, name) }))
    .filter(s => s.seq >= 0)
    .sort((a, b) => a.seq - b.seq)
    .map(s => s.name);
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

/** 每类别写入状态：当天日期 + 分片序号 + 当前分片近似字节数（免每行 stat） */
interface CategoryState {
  date: string;
  seq: number;
  size: number;
}
const writeState = new Map<string, CategoryState>();

/** 同类别写入串行链：appendLine 逐个接力，writeChains 恒存「最近一次写完」的 promise */
const writeChains = new Map<string, Promise<void>>();

/** 等待全部已入队写入完成（测试 / 优雅退出 flush 用） */
export function flushLogWrites(): Promise<void> {
  return Promise.allSettled([...writeChains.values()]).then(() => undefined);
}

function maxSizeBytes(): number {
  const mb = siteConfig.logs.maxFileSizeMb;
  return mb > 0 ? mb * 1024 * 1024 : Number.POSITIVE_INFINITY;
}

/** 总开关 + 分类开关；未知类别默认放行（新增分类没来得及配开关时不能静默丢日志） */
function fileEnabled(category: string): boolean {
  if (!siteConfig.logs.file) return false;
  const on: boolean | undefined = siteConfig.logs.categories[category as keyof typeof siteConfig.logs.categories];
  return on !== false;
}

/** 清理超过保留天数的分片（文件名前缀即日期）；retentionDays 0 = 永久保留 */
async function cleanExpired(category: string, names: string[]): Promise<void> {
  const days = siteConfig.logs.retentionDays;
  if (days <= 0) return;
  const cutoff = Date.now() - days * 86400_000;
  await Promise.all(
    names.map(async name => {
      if (!/^\d{4}-\d{2}-\d{2}/.test(name)) return;
      const d = Date.parse(`${name.slice(0, 10)}T00:00:00`);
      if (!Number.isNaN(d) && d < cutoff) {
        await rm(join(LOGS_DIR, category, name), { force: true }).catch(() => undefined);
      }
    }),
  );
}

/** 新的一天（或进程首写）初始化分片状态：stat 接续已有分片追加而不是另起 seq，并顺手清理过期文件 */
async function initState(category: string, day: string): Promise<CategoryState> {
  const dir = join(LOGS_DIR, category);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { date: day, seq: 0, size: 0 };
  }
  await cleanExpired(category, names);
  const shards = dayShardFiles(day, names);
  if (shards.length === 0) return { date: day, seq: 0, size: 0 };
  const last = shards[shards.length - 1]!;
  try {
    return { date: day, seq: shardSeq(day, last), size: (await stat(join(dir, last))).size };
  } catch {
    return { date: day, seq: shardSeq(day, last), size: 0 };
  }
}

/**
 * 把一行日志追加进 `{LOGS_DIR}/{category}/` 当天分片；同类别经 promise 链串行。
 * 失败 → console.error，不抛。
 */
async function appendLine(category: string, line: string): Promise<void> {
  try {
    const day = dateKey();
    let st = writeState.get(category);
    if (!st || st.date !== day) {
      st = await initState(category, day);
      writeState.set(category, st);
    }
    if (st.size > 0 && st.size >= maxSizeBytes()) {
      st.seq += 1;
      st.size = 0;
    }
    const dir = join(LOGS_DIR, category);
    await ensureDir(dir);
    await appendFile(join(dir, shardName(day, st.seq)), line + "\n", "utf8");
    st.size += Buffer.byteLength(line, "utf8") + 1;
  } catch (error) {
    console.error(`[log] 写日志文件失败 (${category}):`, error instanceof Error ? error.message : String(error));
  }
}

function writeLogFile(category: string, line: string): Promise<void> {
  const next = (writeChains.get(category) ?? Promise.resolve()).catch(() => undefined).then(() => appendLine(category, line));
  writeChains.set(category, next.catch(() => undefined));
  return next;
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
  const line = siteConfig.logs.lineFormat.replace("{ts}", ts)
    .replace("{tag}", labelOf(opts.tag))
    .replace("{level}", opts.level.toUpperCase())
    .replace("{msg}", opts.msg)
    .replace("{caller}", opts.caller ?? "")
    .replace("{kv}", kv);
  if (opts.level === "error") console.error(line);
  else if (opts.level === "warn") console.warn(line);
  else console.log(line);

  if (fileEnabled(category)) void writeLogFile(category, line);
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
export const LOGS_DIR_RESOLVED = LOGS_DIR;
