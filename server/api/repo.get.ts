/**
 * GET /api/repo?p=github|gitee&owner=x&repo=y —— 仓库卡片信息代理。
 *
 * 为何代理：MarkdownRepo 原本每个访客浏览器直连 api.github.com（未认证配额
 * 60 次/小时/**每 IP**），文章里仓库卡片一多读者侧极易 403。改服务端代理后
 * 全站共享一份缓存（Redis 24h + 内存兜底），每个仓库每天最多回源 1 次。
 *
 * 安全：owner/repo 严格白名单字符 + 定长上限（拼 URL 前校验，防路径注入）；
 * 出站走 fetchPublicUrl（SSRF 防护 + DNS rebinding 封堵）；经 referer-check 门禁 +
 * rate-limit 中间件（GET /api/repo 30/min），防第三方借道刷配额。
 */
import { fetchPublicUrl } from "#server/utils/safe-fetch";
import { redis } from "#server/utils/redis";
import type { RepoInfo, RepoResponse } from "#server/types/apis/repo";

const PLATFORM_API_BASE: Record<"github" | "gitee", string> = {
  github: "https://api.github.com/repos",
  gitee: "https://gitee.com/api/v5/repos",
};

// owner/repo 只允许字母数字与 _ . -（GitHub/Gitee 命名空间的合法子集），防 URL 拼接注入
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;

const FRESH_MS = 24 * 60 * 60 * 1000;
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const MEMORY_CACHE_CAP = 200;

interface CacheEntry {
  at: number;
  data: RepoInfo;
}

// Redis 未配置（noredis 部署/测试）时的进程内兜底；带容量上限防无界增长
const memoryCache = new Map<string, CacheEntry>();

function readCache(key: string): CacheEntry | null {
  return memoryCache.get(key) ?? null;
}

function writeMemoryCache(key: string, entry: CacheEntry): void {
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  while (memoryCache.size > MEMORY_CACHE_CAP) {
    const oldest = memoryCache.keys().next().value;
    if (oldest === undefined) break;
    memoryCache.delete(oldest);
  }
}

async function readRedisCache(key: string): Promise<CacheEntry | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as CacheEntry) : null;
  } catch {
    return null;
  }
}

async function writeRedisCache(key: string, entry: CacheEntry): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(entry), "EX", Math.floor(FRESH_MS / 1000));
  } catch {
    // 缓存写失败不影响响应
  }
}

/** 上游 JSON → 归一化白名单字段（不透传上游多余字段） */
function normalize(platform: "github" | "gitee", owner: string, repo: string, raw: Record<string, unknown>): RepoInfo {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    platform,
    owner,
    repo,
    fullName: str(raw.full_name) || `${owner}/${repo}`,
    description: str(raw.description),
    language: str(raw.language),
    stars: num(raw.stargazers_count),
    forks: num(raw.forks_count),
  };
}

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const platform = query.p === "github" || query.p === "gitee" ? query.p : null;
  const owner = typeof query.owner === "string" ? query.owner : "";
  const repo = typeof query.repo === "string" ? query.repo : "";

  if (!platform || !NAME_RE.test(owner) || !NAME_RE.test(repo)) {
    throw createError({ statusCode: 400, message: "参数非法" });
  }

  const key = `repo:${platform}:${owner}/${repo}`;
  const now = Date.now();

  // 读缓存：Redis 优先 → 内存兜底
  const cached = (await readRedisCache(key)) ?? readCache(key);
  if (cached && now - cached.at < FRESH_MS) {
    setHeader(event, "Cache-Control", "public, max-age=600");
    return { success: true, data: cached.data, cached: true } satisfies RepoResponse;
  }

  // 回源
  try {
    const data = await fetchPublicUrl<Record<string, unknown>>(
      `${PLATFORM_API_BASE[platform]}/${owner}/${repo}`,
      async response => {
        if (!response.ok) throw new Error(`upstream ${response.status}`);
        return (await response.json()) as Record<string, unknown>;
      },
      { headers: { "User-Agent": "imqi1-cms", Accept: "application/vnd.github+json" } },
      8000,
    );
    const entry: CacheEntry = { at: now, data: normalize(platform, owner, repo, data) };
    writeMemoryCache(key, entry);
    await writeRedisCache(key, entry);
    setHeader(event, "Cache-Control", "public, max-age=600");
    return { success: true, data: entry.data } satisfies RepoResponse;
  } catch (error) {
    // 回源失败（上游 404/限流/网络）：7 天内的旧值兜底展示，超出则报错
    if (cached && now - cached.at < STALE_MAX_MS) {
      setHeader(event, "Cache-Control", "public, max-age=300");
      return { success: true, data: cached.data, stale: true } satisfies RepoResponse;
    }
    console.error("[repo] 获取仓库信息失败:", error instanceof Error ? error.message : error);
    throw createError({ statusCode: 502, message: "仓库信息获取失败" });
  }
});
