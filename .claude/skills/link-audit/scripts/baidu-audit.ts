#!/usr/bin/env bun
/**
 * 百度内容审核（机审预筛）→ moderation.json
 *
 * 用法：
 *   bun .claude/skills/link-audit/scripts/baidu-audit.ts --work "$WORK" [--concurrency 2] [--chunk-chars 8000] [--max-items 0]
 *
 * 作用：把每份快照正文送百度内容审核，拿「合规/疑似/不合规 + 违规类型 + 命中词 + logId」，
 * 供复核阶段**优先看命中段**、并把机审结论作为独立证据写进报告（logId 可作留档凭证）。
 *
 * 凭证来源（优先级从高到低）：
 *   1. 进程环境 BAIDU_API_KEY / BAIDU_SECRET_KEY
 *   2. skill 目录下的 .env.local（未纳入版本管理，见 .env.local.example）
 *   3. 站内 DB 的 informations 表（站主后台已配置的 baiduApiKey / baiduSecretKey）
 * 都没有 → 跳过机审（不报错），复核阶段退回纯模型判读。
 *
 * 接口与站内 server/utils/baidu-audit.ts 保持一致（百度自定义文本审核 v2，同步版）。
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { baiduSeverityRank, hasAuditFailure, parseArgs, pickWorstConclusion, readJson, writeJson } from "./lib";

interface Block {
  index: number;
  charStart: number;
  charEnd: number;
  text: string;
}

interface ModerationItem {
  file: string;
  targetKind: "link" | "subscribe";
  targetId: number;
  name: string;
  url: string;
  title: string;
  chars: number;
  worstConclusionType: number;
  conclusion: string;
  logId: number | null;
  /** 有块没审成（本地异常或百度返回 4）：该条目/目标的结论只是「已审部分」的最差值，不等于全量判定。 */
  auditFailed: boolean;
  hits: ModerationHit[];
  blocks: Array<{
    index: number;
    charStart: number;
    charEnd: number;
    conclusionType: number;
    conclusion: string;
    logId: number | null;
    preview: string;
    error: string | null;
  }>;
}

interface Manifest {
  targets: Array<{ kind: "link" | "subscribe"; id: number; name: string; url: string; files: string[] }>;
}

const args = parseArgs(process.argv.slice(2));
const workDir = typeof args.work === "string" ? args.work : join(tmpdir(), "link-audit");
const concurrency = Number(typeof args.concurrency === "string" ? args.concurrency : 2);
const chunkBytes = Number(typeof args["chunk-bytes"] === "string" ? args["chunk-bytes"] : 12000);
const qps = Number(typeof args.qps === "string" ? args.qps : 3);
const maxItems = Number(typeof args["max-items"] === "string" ? args["max-items"] : 0);
const skillDir = resolve(import.meta.dir, "..");
const auditUrl = typeof args.url === "string" ? args.url : "https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined";

const manifest = await readJson<Manifest>(join(workDir, "manifest.json"));

/** 读凭证：进程环境 → skill 的 .env.local → 站内 DB。 */
async function resolveCredentials(): Promise<{ apiKey: string; secretKey: string; source: string } | null> {
  if (process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY) {
    return { apiKey: process.env.BAIDU_API_KEY, secretKey: process.env.BAIDU_SECRET_KEY, source: "env" };
  }
  const { config } = await import("dotenv");
  config({ path: join(skillDir, ".env.local"), quiet: true });
  if (process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY) {
    return { apiKey: process.env.BAIDU_API_KEY, secretKey: process.env.BAIDU_SECRET_KEY, source: "skill .env.local" };
  }
  try {
    const [{ Client }, { config: loadEnv }] = await Promise.all([import("pg"), import("dotenv")]);
    loadEnv({ path: ".env", quiet: true });
    const client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await client.connect();
    try {
      const res = await client.query<{ key: string; value: string }>(
        `SELECT key, value FROM informations WHERE key IN ($1, $2)`,
        ["baiduApiKey", "baiduSecretKey"],
      );
      const map = new Map(res.rows.map(r => [r.key, r.value]));
      const apiKey = map.get("baiduApiKey");
      const secretKey = map.get("baiduSecretKey");
      if (apiKey && secretKey) return { apiKey, secretKey, source: "DB informations" };
    } finally {
      await client.end();
    }
  } catch {
    // 连不上库就当没配，不影响其余流程
  }
  return null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const response = await fetch(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  );
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error(`取 access_token 失败：HTTP ${response.status}`);
  cachedToken = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 1800) - 300) * 1000 };
  return cachedToken.token;
}

interface BaiduResponse {
  conclusionType?: number;
  conclusion?: string;
  log_id?: number;
  error_code?: number;
  error_msg?: string;
  data?: Array<{
    type?: number;
    subType?: number;
    conclusion?: string;
    conclusionType?: number;
    label?: string;
    prob?: number;
    words?: Array<{ word?: string; prob?: number }>;
    msg?: string;
    hits?: Array<{
      words?: string[];
      probability?: number;
      datasetName?: string;
      details?: string[];
      wordHitPositions?: Array<{
        label?: string;
        labelDesc?: string;
        subLabel?: string;
        subLabelDesc?: string;
        keyword?: string;
        positions?: number[][];
      }>;
    }>;
  }>;
}

/** 机审命中项：命中词 + 在正文里的字符区间 + 风险子类。 */
interface ModerationHit {
  keyword: string;
  charStart: number;
  charEnd: number;
  risk: string;
  detail: string;
  msg: string;
  prob: number;
}

/** 调一次审核接口；限流/偶发 5xx 退避重试，超长（overlength）直接抛出交由调用方二分。 */
async function auditText(token: string, text: string): Promise<BaiduResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    try {
      const response = await fetch(`${auditUrl}?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `text=${encodeURIComponent(text)}`,
      });
      const result = (await response.json()) as BaiduResponse;
      if (result.error_code) {
        const message = `百度返回错误 ${result.error_code}：${result.error_msg ?? "未知"}`;
        if (message.includes("overlength")) throw new Error(message);
        throw new Error(message);
      }
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // 超长重试无意义，直接抛给调用方做二分
      if (message.includes("overlength")) throw error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 简单的 QPS 闸门（百度文本审核有 QPS 限制，超了会限流）。 */
let lastRequestAt = 0;
async function throttle(): Promise<void> {
  const minGap = 1000 / qps;
  const wait = lastRequestAt + minGap - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

/** 把正文按段落聚合成 ≤ limit 字节的块，保留字符区间用于定位。
 *
 * 百度自定义文本审核 v2 的单条长度上限实测在 6000–8000 字符之间（超限报 282909 text overlength），
 * 与官方文档标称的 20000 字符不符 → 这里按 UTF-8 **字节**切块（保守 12000 字节），
 * 并且遇到 overlength 再自动二分重试，不依赖猜上限。
 */
const encoder = new TextEncoder();

function chunkText(text: string, limitBytes: number): Block[] {
  const blocks: Block[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let buffer = "";
  let start = 0;
  let cursor = 0;

  const flush = (end: number) => {
    if (!buffer.trim()) {
      buffer = "";
      start = cursor;
      return;
    }
    blocks.push({ index: blocks.length, charStart: start, charEnd: end, text: buffer });
    buffer = "";
    start = cursor;
  };

  for (const paragraph of paragraphs) {
    const piece = `${paragraph}\n\n`;
    const candidate = buffer + piece;
    if (encoder.encode(candidate).length > limitBytes && buffer.length > 0) {
      flush(cursor);
    }
    if (!buffer) start = cursor;
    buffer += piece;
    cursor += piece.length;
  }
  flush(cursor);
  return blocks;
}

/** 从百度响应里抽命中词，并在块文本中定位字符区间（positions 语义不稳，优先用关键词实搜）。 */
function extractHits(response: BaiduResponse, blockText: string): ModerationHit[] {
  const hits: ModerationHit[] = [];
  for (const entry of response.data ?? []) {
    for (const hit of entry.hits ?? []) {
      for (const position of hit.wordHitPositions ?? []) {
        const keyword = position.keyword ?? "";
        const risk = position.labelDesc ?? position.subLabelDesc ?? "";
        const detail = (hit.details ?? []).join("、");
        let start = -1;
        let end = -1;
        if (keyword) {
          const found = blockText.indexOf(keyword);
          if (found >= 0) {
            start = found;
            end = found + keyword.length;
          }
        }
        if (start < 0) {
          const range = position.positions?.[0];
          const from = range?.[0];
          const to = range?.[1];
          if (from !== undefined && to !== undefined && from >= 0 && to > from && to <= blockText.length) {
            start = from;
            end = to;
          }
        }
        if (start < 0) continue;
        hits.push({ keyword, charStart: start, charEnd: end, risk, detail, msg: entry.msg ?? "", prob: hit.probability ?? 0 });
      }
    }
  }
  const seen = new Set<string>();
  return hits.filter(hit => {
    const key = `${hit.charStart}:${hit.charEnd}:${hit.keyword}:${hit.risk}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 解析快照文件的元信息头与正文。 */
function parseSnapshot(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  const parts = raw.split("\n---\n");
  const head = parts[0] ?? "";
  const body = parts.slice(1).join("\n---\n");
  for (const line of head.split("\n")) {
    const m = /^#\s*([^:]+):\s*(.*)$/.exec(line);
    if (m?.[1]) meta[m[1].trim()] = (m[2] ?? "").trim();
  }
  return { meta, body };
}

const credentials = await resolveCredentials();
if (!credentials) {
  console.log("[baidu-audit] 未找到百度审核凭证（env / skill .env.local / DB informations 都没有）→ 跳过机审，复核阶段退回纯模型判读");
  process.exit(0);
}
console.log(`[baidu-audit] 凭证来源：${credentials.source}`);

const token = await getAccessToken(credentials.apiKey, credentials.secretKey);

/** 汇总要审的文件：manifest 的每个目标 → 其快照文件。 */
const workItems: Array<{ file: string; targetKind: "link" | "subscribe"; targetId: number; name: string; url: string }> = [];
for (const target of manifest.targets) {
  for (const file of target.files) {
    workItems.push({ file, targetKind: target.kind, targetId: target.id, name: target.name, url: target.url });
  }
}
const limited = maxItems > 0 ? workItems.slice(0, maxItems) : workItems;

const items: ModerationItem[] = [];
let cursor = 0;
let done = 0;

async function worker(): Promise<void> {
  for (;;) {
    const index = cursor++;
    if (index >= limited.length) return;
    const item = limited[index];
    if (!item) return;
    const raw = await Bun.file(item.file).text();
    const { meta, body } = parseSnapshot(raw);
    const blocks = chunkText(body, chunkBytes);
    const results: ModerationItem["blocks"] = [];
    const hits: ModerationHit[] = [];

    for (const block of blocks) {
      if (!block.text.trim()) continue;
      try {
        const response = await auditText(token, block.text);
        const entry = response.data?.[0];
        const conclusionType = response.conclusionType ?? entry?.conclusionType ?? 0;
        results.push({
          index: block.index,
          charStart: block.charStart,
          charEnd: block.charEnd,
          conclusionType,
          conclusion: response.conclusion ?? entry?.conclusion ?? "未知",
          logId: response.log_id ?? null,
          preview: block.text.slice(0, 120).replace(/\s+/g, " "),
          error: null,
        });
        for (const hit of extractHits(response, block.text)) {
          hits.push({ ...hit, charStart: block.charStart + hit.charStart, charEnd: block.charStart + hit.charEnd });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 仍超长 → 该块二分重试，再失败才记为审核失败
        if (message.includes("overlength") && block.text.length > 200) {
          const mid = Math.floor(block.text.length / 2);
          const halves = [
            { offset: 0, part: block.text.slice(0, mid) },
            { offset: mid, part: block.text.slice(mid) },
          ];
          for (const half of halves) {
            if (!half.part.trim()) continue;
            const base = block.charStart + half.offset;
            try {
              const sub = await auditText(token, half.part);
              const subEntry = sub.data?.[0];
              results.push({
                index: block.index,
                charStart: base,
                charEnd: base + half.part.length,
                conclusionType: sub.conclusionType ?? subEntry?.conclusionType ?? 0,
                conclusion: sub.conclusion ?? subEntry?.conclusion ?? "未知",
                logId: sub.log_id ?? null,
                preview: half.part.slice(0, 120).replace(/\s+/g, " "),
                error: null,
              });
              for (const hit of extractHits(sub, half.part)) {
                hits.push({ ...hit, charStart: base + hit.charStart, charEnd: base + hit.charEnd });
              }
            } catch (subError) {
              results.push({
                index: block.index,
                charStart: base,
                charEnd: base + half.part.length,
                conclusionType: 0,
                conclusion: "审核失败",
                logId: null,
                preview: half.part.slice(0, 120).replace(/\s+/g, " "),
                error: subError instanceof Error ? subError.message : String(subError),
              });
            }
          }
          continue;
        }
        results.push({
          index: block.index,
          charStart: block.charStart,
          charEnd: block.charEnd,
          conclusionType: 0,
          conclusion: "审核失败",
          logId: null,
          preview: block.text.slice(0, 120).replace(/\s+/g, " "),
          error: message,
        });
      }
    }

    const worstBlock = pickWorstConclusion(results);
    items.push({
      file: item.file,
      targetKind: item.targetKind,
      targetId: item.targetId,
      name: item.name,
      url: item.url,
      title: meta.title ?? meta.name ?? "",
      chars: body.length,
      worstConclusionType: worstBlock?.conclusionType ?? 0,
      conclusion: worstBlock?.conclusion ?? "未知",
      logId: worstBlock?.logId ?? null,
      auditFailed: hasAuditFailure(results),
      hits,
      blocks: results,
    });
    done++;
    if (done % 20 === 0) console.log(`[baidu-audit] 已审 ${done}/${limited.length}`);
  }
}

await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, limited.length)) }, () => worker()));

const byConclusion: Record<string, number> = {};
for (const item of items) {
  const key = String(item.worstConclusionType);
  byConclusion[key] = (byConclusion[key] ?? 0) + 1;
}
const failed = items.filter(i => i.auditFailed);

/** 按目标聚合：一个目标（友链/订阅源）汇总其所有快照的机审结论与命中。 */
const targetMap = new Map<string, {
  targetKind: "link" | "subscribe";
  targetId: number;
  name: string;
  url: string;
  conclusionType: number;
  conclusion: string;
  chars: number;
  files: string[];
  hits: Array<ModerationHit & { file: string }>;
  logIds: number[];
  auditFailed: boolean;
}>();

for (const item of items) {
  const key = `${item.targetKind}:${item.targetId}`;
  const existing = targetMap.get(key);
  if (!existing) {
    targetMap.set(key, {
      targetKind: item.targetKind,
      targetId: item.targetId,
      name: item.name,
      url: item.url,
      conclusionType: item.worstConclusionType,
      conclusion: item.conclusion,
      chars: item.chars,
      files: [item.file],
      hits: item.hits.map(hit => ({ ...hit, file: item.file })),
      logIds: item.logId ? [item.logId] : [],
      auditFailed: item.auditFailed,
    });
    continue;
  }
  existing.chars += item.chars;
  existing.files.push(item.file);
  existing.hits.push(...item.hits.map(hit => ({ ...hit, file: item.file })));
  if (item.logId) existing.logIds.push(item.logId);
  existing.auditFailed = existing.auditFailed || item.auditFailed;
  if (baiduSeverityRank(item.worstConclusionType) > baiduSeverityRank(existing.conclusionType)) {
    existing.conclusionType = item.worstConclusionType;
    existing.conclusion = item.conclusion;
  }
}

const targetList = [...targetMap.values()].sort(
  (a, b) => baiduSeverityRank(b.conclusionType) - baiduSeverityRank(a.conclusionType) || b.hits.length - a.hits.length,
);
const flaggedTargets = targetList.filter(t => t.conclusionType === 2 || t.conclusionType === 3);

const output = {
  generatedAt: new Date().toISOString(),
  credentialSource: credentials.source,
  api: auditUrl,
  summary: {
    items: items.length,
    targets: targetList.length,
    flaggedItems: items.filter(i => i.worstConclusionType === 2 || i.worstConclusionType === 3).length,
    flaggedTargets: flaggedTargets.length,
    failed: failed.length,
    auditFailedTargets: targetList.filter(t => t.auditFailed).length,
    byConclusion,
  },
  targets: targetList,
  items,
};

await writeJson(join(workDir, "moderation.json"), output);
console.log(
  `[baidu-audit] 完成：送审 ${items.length} 份 / ${targetList.length} 个目标，命中目标 ${flaggedTargets.length} 个，失败 ${failed.length} 份 → ${join(workDir, "moderation.json")}`,
);
