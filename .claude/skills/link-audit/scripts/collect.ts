#!/usr/bin/env bun
/**
 * 采集待审目标清单（友链 + 订阅）→ targets.json
 *
 * 用法：
 *   bun .claude/skills/link-audit/scripts/collect.ts --source online --base https://imqi1.com
 *   bun .claude/skills/link-audit/scripts/collect.ts --source local
 *
 * online：读线上部署站点的公开接口（/api/links 友链、/api/subscribes 订阅文章），反映「访客实际看到」的现状。
 * local ：直连本机 PostgreSQL（.env 的 DB_*），拿到库里全部订阅文章正文（含未上站的内容）。
 * 两种模式都产出同一份结构，scan.ts 不区分来源。
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, writeJson } from "./lib";

export interface TargetLink {
  id: number;
  name: string;
  url: string;
  desc: string;
  avatar: string;
}

export interface TargetSubscribe {
  id: number;
  name: string;
  url: string;
  avatar: string;
}

export interface TargetPost {
  subscribeId: number;
  title: string;
  link: string;
  description: string;
  content: string;
  pubDate: string;
  origin: "cache" | "live";
}

export interface Targets {
  generatedAt: string;
  source: "online" | "local";
  base: string;
  links: TargetLink[];
  subscribes: TargetSubscribe[];
  posts: TargetPost[];
}

const args = parseArgs(process.argv.slice(2));
const source = args.source === "local" ? "local" : "online";
const base = (typeof args.base === "string" ? args.base : "https://imqi1.com").replace(/\/+$/, "");
const workDir = typeof args.work === "string" ? args.work : join(tmpdir(), "link-audit");
const out = typeof args.out === "string" ? args.out : join(workDir, "targets.json");
/** 只审指定目标（逗号分隔 id）；不传则全量。 */
const onlyIds = typeof args.only === "string" ? new Set(args.only.split(",").map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0)) : null;

async function collectOnline(): Promise<Targets> {
  // 生产站点的 /api/* 走 referer-check 中间件：缺 Referer 或域名不在白名单会 403，
  // 这里带上站点自身域名作为 Referer，等同于访客在本站页面上发起的请求。
  const headers = { Referer: `${base}/`, Accept: "application/json" };
  const [linksRes, subsRes] = await Promise.all([
    fetch(`${base}/api/links`, { headers }),
    fetch(`${base}/api/subscribes`, { headers }),
  ]);
  if (!linksRes.ok) throw new Error(`拉取友链失败：HTTP ${linksRes.status}（${base}/api/links）`);
  if (!subsRes.ok) throw new Error(`拉取订阅失败：HTTP ${subsRes.status}（${base}/api/subscribes）`);

  const linksBody = (await linksRes.json()) as { data?: Array<Record<string, unknown>> };
  const subsBody = (await subsRes.json()) as { data?: Array<Record<string, unknown>> };

  const links: TargetLink[] = (linksBody.data ?? []).map(row => ({
    id: Number(row.id ?? 0),
    name: String(row.name ?? ""),
    url: String(row.link ?? ""),
    desc: String(row.desc ?? ""),
    avatar: String(row.avatar ?? ""),
  }));

  const posts: TargetPost[] = (subsBody.data ?? []).map(row => ({
    subscribeId: Number(row.subscribeId ?? 0),
    title: String(row.title ?? ""),
    link: String(row.link ?? ""),
    description: String(row.description ?? ""),
    content: "",
    pubDate: String(row.pubDate ?? ""),
    origin: "live" as const,
  }));

  // 订阅源清单：线上接口只给文章，不给源列表——用文章里的 subscribeId/subscribeName 反推
  const byId = new Map<number, TargetSubscribe>();
  for (const row of subsBody.data ?? []) {
    const id = Number(row.subscribeId ?? 0);
    if (!id || byId.has(id)) continue;
    byId.set(id, { id, name: String(row.subscribeName ?? ""), url: "", avatar: String(row.subscribeAvatar ?? "") });
  }

  return { generatedAt: new Date().toISOString(), source: "online", base, links, subscribes: [...byId.values()], posts };
}

async function collectLocal(): Promise<Targets> {
  const [{ config }, { Client }] = await Promise.all([import("dotenv"), import("pg")]);
  config({ path: ".env", quiet: true });

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try {
    const linksRes = await client.query<{ id: number; name: string; link: string; desc: string | null; avatar: string | null }>(
      `SELECT id, name, link, "desc", avatar FROM links
       WHERE enabled = true AND ("isModification" = false OR ("isModification" = true AND "modificationStatus" = 'approved'))
       ORDER BY id`,
    );
    const subsRes = await client.query<{ id: number; name: string; url: string; avatar: string | null }>(
      `SELECT id, name, url, avatar FROM subscribes ORDER BY id`,
    );
    const postsRes = await client.query<{
      subscribeId: number; title: string; link: string; description: string | null; content: string | null; pubDate: Date | null;
    }>(
      `SELECT "subscribeId", title, link, description, content, "pubDate" FROM subscribeposts ORDER BY "pubDate" DESC NULLS LAST`,
    );

    return {
      generatedAt: new Date().toISOString(),
      source: "local",
      base,
      links: linksRes.rows.map(row => ({
        id: row.id,
        name: row.name,
        url: row.link,
        desc: row.desc ?? "",
        avatar: row.avatar ?? "",
      })),
      subscribes: subsRes.rows.map(row => ({ id: row.id, name: row.name, url: row.url, avatar: row.avatar ?? "" })),
      posts: postsRes.rows.map(row => ({
        subscribeId: row.subscribeId,
        title: row.title,
        link: row.link,
        description: row.description ?? "",
        content: row.content ?? "",
        pubDate: row.pubDate ? new Date(row.pubDate).toISOString() : "",
        origin: "cache" as const,
      })),
    };
  } finally {
    await client.end();
  }
}

const targets = source === "local" ? await collectLocal() : await collectOnline();

if (onlyIds) {
  targets.links = targets.links.filter(l => onlyIds.has(l.id));
  targets.subscribes = targets.subscribes.filter(s => onlyIds.has(s.id));
  targets.posts = targets.posts.filter(p => onlyIds.has(p.subscribeId));
}

await writeJson(out, targets);

console.log(
  `[collect] 来源=${targets.source} 友链=${targets.links.length} 订阅源=${targets.subscribes.length} 订阅文章=${targets.posts.length} → ${out}`,
);
