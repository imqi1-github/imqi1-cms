#!/usr/bin/env bun
/**
 * 抓取目标并落盘「文本快照」→ manifest.json
 *
 * 用法：
 *   bun .claude/skills/link-audit/scripts/snapshot.ts --targets targets.json [--work <dir>] [--max-pages 3]
 *
 * 本脚本只做搬运：抓页面 → 剥标签 → 存文本 → 记结构化元数据。
 * 不做任何内容判定（判定由模型读快照后给出），也不落任何关键词规则表。
 *
 * 产物目录默认在系统临时目录（仓库外），避免把抓取到的页面正文写进项目目录。
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

import { XMLParser } from "fast-xml-parser";

import {
  domainOf,
  extractEmbeddedTargets,
  extractOutboundDomains,
  extractSameSiteLinks,
  extractTitle,
  fetchText,
  mapWithConcurrency,
  maskThirdParty,
  parseArgs,
  readJson,
  stripHtml,
  writeJson,
  writeText,
} from "./lib";

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

export interface PageSnapshot {
  url: string;
  file: string;
  status: number;
  title: string;
  chars: number;
}

export interface TargetManifest {
  kind: "link" | "subscribe";
  id: number;
  name: string;
  url: string;
  domain: string | null;
  finalUrl: string | null;
  status: number;
  reachable: boolean;
  error: string | null;
  title: string;
  files: string[];
  pages: PageSnapshot[];
  outboundDomains: string[];
  embeddedTargets: string[];
  notes: string[];
}

const args = parseArgs(process.argv.slice(2));
const targetsPath = typeof args.targets === "string" ? args.targets : "targets.json";
const workDir = typeof args.work === "string" ? args.work : join(tmpdir(), "link-audit");
const maxPages = Number(typeof args["max-pages"] === "string" ? args["max-pages"] : 3);
const timeoutMs = Number(typeof args.timeout === "string" ? args.timeout : 15000);
const maxPostChars = Number(typeof args["max-post-chars"] === "string" ? args["max-post-chars"] : 20000);
const maxPostsPerSource = Number(typeof args["max-posts"] === "string" ? args["max-posts"] : 12);

const targets = await readJson<Targets>(targetsPath);
const fetchOptions = { timeoutMs };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "_", textNodeName: "#text" });

/** 从 feed XML 里取出条目（RSS item / Atom entry）。 */
function parseFeedItems(xml: string): Array<{ title: string; link: string; description: string; content: string; pubDate: string }> {
  const items: Array<{ title: string; link: string; description: string; content: string; pubDate: string }> = [];
  let feed: Record<string, unknown>;
  try {
    feed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return items;
  }
  const text = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object" && "#text" in value) return String((value as Record<string, unknown>)["#text"] ?? "");
    return String(value);
  };

  const rss = feed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rssItems = channel?.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  for (const raw of rssItems) {
    const item = raw as Record<string, unknown>;
    let link = text(item.link);
    const atomLink = item["atom:link"];
    if (!link && atomLink) {
      const list = Array.isArray(atomLink) ? atomLink : [atomLink];
      for (const al of list) {
        const href = (al as Record<string, unknown>)?.["_href"];
        if (typeof href === "string" && href) {
          link = href;
          break;
        }
      }
    }
    items.push({
      title: text(item.title),
      link,
      description: text(item.description),
      content: text(item["content:encoded"]) || text(item.content),
      pubDate: text(item.pubDate),
    });
  }

  const atom = feed.feed as Record<string, unknown> | undefined;
  const entries = atom?.entry ? (Array.isArray(atom.entry) ? atom.entry : [atom.entry]) : [];
  for (const raw of entries) {
    const entry = raw as Record<string, unknown>;
    let link = "";
    const rawLink = entry.link;
    if (Array.isArray(rawLink)) {
      for (const l of rawLink) {
        const href = (l as Record<string, unknown>)?.["_href"];
        if (typeof href === "string" && href) {
          link = href;
          break;
        }
      }
    } else if (rawLink) {
      const href = (rawLink as Record<string, unknown>)?.["_href"];
      link = typeof href === "string" ? href : "";
    }
    items.push({
      title: text(entry.title),
      link,
      description: text(entry.summary) || text(entry.content),
      content: text(entry.content),
      pubDate: text(entry.published) || text(entry.updated),
    });
  }
  return items;
}

/** 生成快照文件正文（带元信息头，便于模型定位）。 */
function snapshotBody(header: Record<string, string | number | null>, text: string): string {
  const lines = Object.entries(header)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `# ${key}: ${String(value)}`);
  return `${lines.join("\n")}\n---\n${text}\n`;
}

async function snapshotLink(link: TargetLink): Promise<TargetManifest> {
  const dir = join(workDir, "targets", `link-${link.id}`);
  const files: string[] = [];
  const pages: PageSnapshot[] = [];
  const notes: string[] = [];
  const outbound = new Set<string>();
  const embedded = new Set<string>();

  // 本站自己展示的友链信息（名称/描述直接渲染在 /links 页）——这是本站呈现的内容，必须一并送审
  const infoFile = join(dir, "00-info.txt");
  await writeText(
    infoFile,
    snapshotBody(
      { kind: "meta", target: `link ${link.id}`, name: link.name, url: link.url },
      [`【本站展示的友链名称】${link.name}`, `【本站展示的友链描述】${link.desc || "（空）"}`].join("\n"),
    ),
  );
  files.push(infoFile);

  const home = await fetchText(link.url, fetchOptions);
  const finalUrl = home.ok ? home.finalUrl : link.url;
  // 审查范围：只留该站点自己的内容——他们页面里的友链区/外链聚合/留言板先屏蔽
  const homeMask = home.ok ? maskThirdParty(home.text, finalUrl) : null;
  const homeText = homeMask ? stripHtml(homeMask.html) : "";
  const homeTitle = home.ok ? extractTitle(home.text) : "";

  if (home.ok) {
    const file = join(dir, "00-home.txt");
    await writeText(file, snapshotBody({ kind: "page", target: `link ${link.id}`, name: link.name, url: finalUrl, title: homeTitle, status: home.status }, homeText));
    files.push(file);
    pages.push({ url: finalUrl, file, status: home.status, title: homeTitle, chars: homeText.length });
    for (const d of extractOutboundDomains(home.text, finalUrl, 60)) outbound.add(d);
    for (const t of extractEmbeddedTargets(home.text)) embedded.add(t);
    if (homeText.length < 200) notes.push("首页正文过短，可能内容由 JS 渲染或需登录，模型判读时以站内抽样页为准");
    if (homeTitle) notes.push(`首页标题：${homeTitle}`);
  } else {
    notes.push(`首页抓取失败：${home.error ?? "未知原因"}`);
  }

  const sameSite = home.ok ? extractSameSiteLinks(home.text, finalUrl, maxPages) : [];
  const inner = await mapWithConcurrency(sameSite, 3, async (url, index) => {
    const res = await fetchText(url, fetchOptions);
    const mask = res.ok ? maskThirdParty(res.text, res.finalUrl) : null;
    const text = mask ? stripHtml(mask.html) : "";
    const title = res.ok ? extractTitle(res.text) : "";
    const file = join(dir, `${String(index + 1).padStart(2, "0")}-page.txt`);
    await writeText(file, snapshotBody({ kind: "page", target: `link ${link.id}`, name: link.name, url: res.finalUrl, title, status: res.status }, text));
    return { res, text, title, file, mask };
  });

  for (const item of inner) {
    if (!item.res.ok) {
      notes.push(`站内页抓取失败：${item.res.error ?? "未知"}（${item.res.finalUrl}）`);
      continue;
    }
    files.push(item.file);
    pages.push({ url: item.res.finalUrl, file: item.file, status: item.res.status, title: item.title, chars: item.text.length });
    for (const d of extractOutboundDomains(item.res.text, item.res.finalUrl, 60)) outbound.add(d);
    for (const t of extractEmbeddedTargets(item.res.text)) embedded.add(t);
  }

  if (finalUrl !== link.url) notes.push(`提交地址 ${link.url} 实际跳转到 ${finalUrl}`);
  if (embedded.size) notes.push(`页面含 iframe / meta 跳转目标 ${embedded.size} 个（可能是落地页入口，需逐个判读）`);
  if (outbound.size) notes.push(`首页与抽样页共指向 ${outbound.size} 个站外域名`);
  const offsiteTotal = (homeMask?.offsiteLinks ?? 0) + inner.reduce((sum, item) => sum + (item.mask?.offsiteLinks ?? 0), 0);
  const sectionTotal = (homeMask?.friendSections ?? 0) + inner.reduce((sum, item) => sum + (item.mask?.friendSections ?? 0), 0);
  const commentTotal = (homeMask?.commentBlocks ?? 0) + inner.reduce((sum, item) => sum + (item.mask?.commentBlocks ?? 0), 0);
  if (offsiteTotal || sectionTotal || commentTotal) {
    notes.push(`审查范围已收窄：屏蔽站外链接条目 ${offsiteTotal} 处、友链/导航板块 ${sectionTotal} 个、留言区 ${commentTotal} 个（只审该站自己的内容）`);
  }

  return {
    kind: "link",
    id: link.id,
    name: link.name,
    url: link.url,
    domain: domainOf(link.url),
    finalUrl: home.ok ? finalUrl : null,
    status: home.status,
    reachable: home.ok,
    error: home.error,
    title: homeTitle,
    files,
    pages,
    outboundDomains: [...outbound].slice(0, 60),
    embeddedTargets: [...embedded].slice(0, 20),
    notes,
  };
}

async function snapshotSubscribe(subscribe: TargetSubscribe, posts: TargetPost[]): Promise<TargetManifest> {
  const dir = join(workDir, "targets", `subscribe-${subscribe.id}`);
  const files: string[] = [];
  const pages: PageSnapshot[] = [];
  const notes: string[] = [];

  // 本站展示的订阅源名称（渲染在 /subscribes 侧栏与卡片）
  const infoFile = join(dir, "00-info.txt");
  await writeText(
    infoFile,
    snapshotBody({ kind: "meta", target: `subscribe ${subscribe.id}`, name: subscribe.name, url: subscribe.url }, `【本站展示的订阅源名称】${subscribe.name}`),
  );
  files.push(infoFile);

  // 1) 抓订阅源 feed（本地模式才有源地址；线上模式源地址未公开）
  const liveItems: Array<{ title: string; link: string; description: string; content: string; pubDate: string }> = [];
  if (subscribe.url) {
    const res = await fetchText(subscribe.url, { ...fetchOptions, userAgent: "Mozilla/5.0 (compatible; RSS Reader)" });
    if (res.ok) {
      liveItems.push(...parseFeedItems(res.text));
      notes.push(`订阅源 feed 可访问，共解析到 ${liveItems.length} 条`);
    } else {
      notes.push(`订阅源 feed 抓取失败：${res.error ?? "未知"}`);
    }
  } else {
    notes.push("该模式未提供订阅源地址，仅审计站内已缓存的订阅文章");
  }

  // 2) 站内已缓存/已上站的订阅文章（本站实际渲染的就是这批）
  //    本站 /subscribes 只渲染每源最新 10 篇、全站最新 30 篇（见 server/utils/rss.ts getSubscribePosts），
  //    故按发布时间倒序取前 N 篇覆盖展示窗口；需要全量回溯时调大 --max-posts。
  const recentPosts = [...posts]
    .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
    .slice(0, maxPostsPerSource);
  const postFiles: string[] = [];
  let maskedEntries = 0;
  for (const [index, post] of recentPosts.entries()) {
    // 文章正文里指向「别的站点」的条目同样屏蔽（订阅源自己的内容才是审查对象）
    const bodyMask = post.content ? maskThirdParty(post.content, post.link || subscribe.url) : null;
    if (bodyMask && bodyMask.offsiteLinks) maskedEntries += bodyMask.offsiteLinks;
    const parts = [
      `【标题】${post.title}`,
      post.description ? `【摘要】${post.description}` : "",
      post.content ? `【正文】${bodyMask ? bodyMask.html : post.content}` : "",
    ].filter(Boolean);
    const text = stripHtml(parts.join("\n\n")).slice(0, maxPostChars);
    const file = join(dir, `post-${String(index + 1).padStart(3, "0")}.txt`);
    await writeText(
      file,
      snapshotBody(
        {
          kind: "post",
          target: `subscribe ${subscribe.id}`,
          name: subscribe.name,
          url: post.link,
          title: post.title,
          origin: post.origin,
          pubDate: post.pubDate,
        },
        text,
      ),
    );
    postFiles.push(file);
    pages.push({ url: post.link, file, status: 0, title: post.title, chars: text.length });
  }
  files.push(...postFiles);

  // 3) live feed 条目（本地模式：feed 里有而库里没有的最新内容）
  const liveFiles: string[] = [];
  for (const [index, item] of liveItems.slice(0, 20).entries()) {
    const parts = [`【标题】${item.title}`, item.description ? `【摘要】${item.description}` : "", item.content ? `【正文】${item.content}` : ""]
      .filter(Boolean)
      .join("\n\n");
    const text = stripHtml(parts).slice(0, maxPostChars);
    if (!text.trim()) continue;
    const file = join(dir, `live-${String(index + 1).padStart(3, "0")}.txt`);
    await writeText(file, snapshotBody({ kind: "post", target: `subscribe ${subscribe.id}`, name: subscribe.name, url: item.link, title: item.title, origin: "live", pubDate: item.pubDate }, text));
    liveFiles.push(file);
  }
  files.push(...liveFiles);

  if (posts.length) notes.push(`站内缓存文章 ${posts.length} 篇，本次落盘最近 ${recentPosts.length} 篇（本站 /subscribes 渲染每源最新 10 篇、全站最新 30 篇）`);
  if (maskedEntries) notes.push(`审查范围已收窄：屏蔽文章内站外链接条目 ${maskedEntries} 处`);
  if (liveFiles.length) notes.push(`feed 实时条目 ${liveFiles.length} 条`);

  return {
    kind: "subscribe",
    id: subscribe.id,
    name: subscribe.name,
    url: subscribe.url,
    domain: domainOf(subscribe.url) ?? domainOf(posts[0]?.link ?? ""),
    finalUrl: null,
    status: 0,
    reachable: posts.length > 0 || liveItems.length > 0,
    error: null,
    title: subscribe.name,
    files,
    pages,
    outboundDomains: [],
    embeddedTargets: [],
    notes,
  };
}

const linkManifests = await mapWithConcurrency(targets.links, 4, async link => {
  const manifest = await snapshotLink(link);
  console.log(`[snapshot] 友链 ${link.name} → ${manifest.files.length} 个快照（可达=${manifest.reachable}）`);
  return manifest;
});

const subscribeManifests = await mapWithConcurrency(targets.subscribes, 3, async subscribe => {
  const posts = targets.posts.filter(post => post.subscribeId === subscribe.id);
  const manifest = await snapshotSubscribe(subscribe, posts);
  console.log(`[snapshot] 订阅 ${subscribe.name} → ${manifest.files.length} 个快照`);
  return manifest;
});

const manifest = {
  generatedAt: new Date().toISOString(),
  source: targets.source,
  base: targets.base,
  workDir,
  targets: [...linkManifests, ...subscribeManifests],
};

await writeJson(join(workDir, "manifest.json"), manifest);

const totalFiles = manifest.targets.reduce((sum, t) => sum + t.files.length, 0);
const unreachable = manifest.targets.filter(t => !t.reachable).length;
console.log(`[snapshot] 完成：目标 ${manifest.targets.length} 个，快照 ${totalFiles} 份，不可达 ${unreachable} 个 → ${join(workDir, "manifest.json")}`);
