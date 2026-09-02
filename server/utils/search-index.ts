import { Jieba } from "@node-rs/jieba";

import { prisma } from "#server/utils/prisma";
import { redis } from "#server/utils/redis";
import { getCommentAvatarService, commentAvatarUrl } from "#server/utils/comment-avatar";
import { sanitizeExternalUrl } from "#server/utils/rss";
import { markdownToPlainText } from "#server/utils/markdownToPlainText";
import { escapeHtml, escapeRegExp } from "#shared/html";
import type {
  SearchBranchResult,
  ContentSearchResult,
  CommentSearchResult,
  SubscribeSearchResult,
  SubscribePostSearchResult,
} from "#server/types/apis/search";

// @node-rs/jieba 是原生模块，惰性加载字典（首用才加载，约 5MB），平时零开销
let jiebaInstance: Jieba | null = null;
function getJieba(): Jieba {
  if (!jiebaInstance) jiebaInstance = new Jieba();
  return jiebaInstance;
}

// ============ 索引元数据（informations 键值） ============
const META_KEYS = {
  enabled: "searchIndexEnabled",
  builtAt: "searchIndexBuiltAt",
  count: "searchIndexCount",
  expire: "searchIndexExpire",
  status: "searchIndexStatus",
} as const;
const DEFAULT_EXPIRE = 86400; // 1 天（默认索引过期时长：越小，过期后越早回退逐分支 DB 查询，快照残留窗口越小）
const LOCK_KEY = "custom:search-index:build"; // 构建锁，防搜索触发与手动构建并发重复

// Redis 键前缀
const IDX_DOC = "idx:doc:"; // IDX_DOC<row_type>:<ref_id> → JSON（含 search_text/excerpt/meta）
const IDX_TERM = "idx:term:"; // IDX_TERM<row_type>:<token> → Set<docKey>（倒排列表）

/** 各搜索类型对应的索引 row_type（type="subscribe" 同时含友链） */
const ROW_TYPES: Record<string, string[]> = {
  content: ["content"],
  comment: ["comment"],
  subscribe: ["subscribe", "link"],
  subscribepost: ["subscribepost"],
};

// ============ meta（doc JSON）每分支结构 ============
interface ContentMeta {
  kind: "content";
  cid: number;
  slug: string | null;
  desc: string | null;
  createTime: string; // ISO
  categoryName: string | null;
  categorySlug: string | null;
}
interface CommentMeta {
  kind: "comment";
  coid: number;
  articleTitle: string | null;
  articleUrl: string | null;
  avatar: string;
  createTime: string;
}
interface SubscribeMeta {
  kind: "subscribe" | "link";
  id: number;
  name: string;
  url: string;
  desc: string | null;
  avatar: string | null;
}
interface SubscribepostMeta {
  kind: "subscribepost";
  id: number;
  subscribeId: number;
  subscribeName: string;
  subscribeAvatar: string | null;
  title: string;
  link: string;
  description: string | null;
  author: string | null;
  pubDate: string | null;
}
type RowMeta = ContentMeta | CommentMeta | SubscribeMeta | SubscribepostMeta;

interface IndexDoc {
  row_type: string;
  ref_id: number;
  title: string | null;
  search_text: string;
  excerpt: string | null;
  meta: RowMeta;
}

// ============ 通用工具 ============
/** 多字段拼成空格分隔、折叠空白的归一化文本（分词/命中用） */
function collapse(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 高亮摘要（与 search.get.ts 等价，输入为预计算纯文本） */
function highlightKeyword(text: string, keyword: string, maxLength = 200): string {
  if (!text) return "";
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index === -1) return escapeHtml(text.substring(0, maxLength));

  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + keyword.length + 100);

  let snippet = escapeHtml(text.substring(start, end));
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
  snippet = snippet.replace(regex, "<mark>$1</mark>");

  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

/** 分词（jieba 搜索模式）：去纯空白/单字，控倒排体积；build 与 query 共用保持一致 */
function tokenize(text: string): string[] {
  return getJieba()
    .cutForSearch(text, true)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2); // 丢弃空白 + 单字（高频、体积大）
}

async function resolveGuestbookCid(): Promise<number | null> {
  const messageContentIdMeta = await prisma.informations.findUnique({
    where: { key: "messageContentId" },
  });
  let guestbookCid = messageContentIdMeta?.value ? parseInt(messageContentIdMeta.value) : null;
  if (!guestbookCid) {
    const messageContent = await prisma.contents.findFirst({
      where: { slug: "messages", type: 1, status: 1 },
      select: { cid: true },
    });
    guestbookCid = messageContent?.cid ?? null;
  }
  return guestbookCid;
}

async function setInfo(key: string, value: string): Promise<void> {
  await prisma.informations.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export interface SearchIndexMeta {
  enabled: boolean;
  builtAt: string | null;
  count: number;
  expire: number;
  status: string | null;
}

export async function getIndexMeta(): Promise<SearchIndexMeta> {
  try {
    const rows = await prisma.informations.findMany({
      where: { key: { in: [META_KEYS.enabled, META_KEYS.builtAt, META_KEYS.count, META_KEYS.expire, META_KEYS.status] } },
    });
    const map = rows.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, string>);
    return {
      enabled: map[META_KEYS.enabled] === "true",
      builtAt: map[META_KEYS.builtAt] || null,
      count: Number(map[META_KEYS.count]) || 0,
      expire: Number(map[META_KEYS.expire]) || DEFAULT_EXPIRE,
      status: map[META_KEYS.status] || null,
    };
  } catch (error) {
    console.error(error);
    return { enabled: false, builtAt: null, count: 0, expire: DEFAULT_EXPIRE, status: null };
  }
}

/** 是否用索引：开关开启 且 已构建未过期（可被搜索直接使用） */
export async function isIndexReady(): Promise<boolean> {
  const meta = await getIndexMeta();
  if (!meta.enabled || meta.status !== "ok" || meta.count <= 0 || !meta.builtAt) return false;
  const builtAt = new Date(meta.builtAt).getTime();
  if (Number.isNaN(builtAt)) return false;
  return Date.now() - builtAt <= meta.expire * 1000;
}

// ============ 构建：各分支拍扁成 doc（严格遵循公开可见性白名单） ============
async function collectContentDocs(): Promise<IndexDoc[]> {
  const contents = await prisma.contents.findMany({
    where: { status: 1, type: 0 },
    select: {
      cid: true,
      title: true,
      slug: true,
      desc: true,
      content: true,
      tags: true,
      create_time: true,
      contentrelations: {
        where: { metas: { type: "category" } },
        select: { metas: { select: { name: true, slug: true } } },
        take: 1,
      },
    },
  });

  return contents.map((c) => {
    const category = c.contentrelations?.[0]?.metas;
    const plain = markdownToPlainText(c.content);
    return {
      row_type: "content",
      ref_id: c.cid,
      title: c.title,
      search_text: collapse(c.title, c.desc, c.tags, category?.name, plain),
      excerpt: plain,
      meta: {
        kind: "content",
        cid: c.cid,
        slug: c.slug,
        desc: c.desc,
        createTime: c.create_time.toISOString(),
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
      } satisfies ContentMeta,
    };
  });
}

async function collectCommentDocs(): Promise<IndexDoc[]> {
  const guestbookCid = await resolveGuestbookCid();
  const avatarService = await getCommentAvatarService();

  const comments = await prisma.comments.findMany({
    where: {
      status: 1,
      AND: [
        {
          OR: [
            ...(guestbookCid ? [{ cid: guestbookCid }] : []),
            { content_ref: { status: 1, type: 0 } },
          ],
        },
      ],
    },
    select: {
      coid: true,
      name: true,
      mail: true, // 仅服务端算头像，不落入 doc（白名单）
      content: true,
      create_time: true,
      content_ref: {
        select: {
          cid: true,
          title: true,
          slug: true,
          status: true,
          contentrelations: {
            where: { metas: { type: "category" } },
            select: { metas: { select: { slug: true } } },
            take: 1,
          },
        },
      },
    },
  });

  return comments.map((com) => {
    const ref = com.content_ref;
    let articleUrl: string | null = null;
    if (ref) {
      if (guestbookCid && ref.cid === guestbookCid) {
        articleUrl = `/messages#comment-${com.coid}`;
      } else if (ref.status === 1 && ref.slug) {
        const categorySlug = ref.contentrelations[0]?.metas?.slug;
        if (categorySlug) {
          articleUrl = `/content/${categorySlug}/${ref.slug}#comment-${com.coid}`;
        } else if (ref.contentrelations.length === 0) {
          articleUrl = `/content/uncategorized/${ref.slug}#comment-${com.coid}`;
        }
      }
    }

    const full = com.content ?? "";
    return {
      row_type: "comment",
      ref_id: com.coid,
      title: com.name,
      search_text: collapse(com.name, full),
      excerpt: full, // 评论返回完整内容（不生成高亮）
      meta: {
        kind: "comment",
        coid: com.coid,
        articleTitle: ref?.title ?? null,
        articleUrl,
        avatar: commentAvatarUrl(com.mail, avatarService),
        createTime: com.create_time.toISOString(),
      } satisfies CommentMeta,
    };
  });
}

async function collectSubscribeDocs(): Promise<IndexDoc[]> {
  const [subscribes, links] = await Promise.all([
    // 订阅源：全部入库（与 searchSubscribes 一致，无 enabled 过滤）
    prisma.subscribes.findMany({ select: { id: true, name: true, url: true, avatar: true, desc: true } }),
    // 友链：仅已启用且过审（与 searchSubscribes 的 links 分支一致）
    prisma.links.findMany({
      where: {
        enabled: true,
        AND: [
          { OR: [{ isModification: false }, { isModification: true, modificationStatus: "approved" }] },
        ],
      },
      select: { id: true, name: true, link: true, desc: true, avatar: true },
    }),
  ]);

  const docs: IndexDoc[] = [];
  for (const s of subscribes) {
    docs.push({
      row_type: "subscribe",
      ref_id: s.id,
      title: s.name,
      search_text: collapse(s.name, s.url, s.desc),
      excerpt: s.desc,
      meta: { kind: "subscribe", id: s.id, name: s.name, url: s.url, desc: s.desc, avatar: s.avatar } satisfies SubscribeMeta,
    });
  }
  for (const l of links) {
    docs.push({
      row_type: "link",
      ref_id: l.id,
      title: l.name,
      search_text: collapse(l.name, l.link, l.desc),
      excerpt: l.desc,
      meta: {
        kind: "link",
        id: l.id,
        name: l.name,
        url: sanitizeExternalUrl(l.link),
        desc: l.desc,
        avatar: l.avatar,
      } satisfies SubscribeMeta,
    });
  }
  return docs;
}

async function collectSubscribepostDocs(): Promise<IndexDoc[]> {
  const posts = await prisma.subscribeposts.findMany({
    select: {
      id: true,
      subscribeId: true,
      title: true,
      link: true,
      description: true,
      content: true,
      author: true,
      pubDate: true,
      subscribe: { select: { name: true, avatar: true } },
    },
  });

  return posts.map((p) => {
    const plain = markdownToPlainText(p.content);
    return {
      row_type: "subscribepost",
      ref_id: p.id,
      title: p.title,
      search_text: collapse(p.title, p.description, p.author, plain),
      excerpt: p.description,
      meta: {
        kind: "subscribepost",
        id: p.id,
        subscribeId: p.subscribeId,
        subscribeName: p.subscribe.name,
        subscribeAvatar: p.subscribe.avatar,
        title: p.title,
        link: sanitizeExternalUrl(p.link),
        description: p.description,
        author: p.author,
        pubDate: p.pubDate?.toISOString() ?? null,
      } satisfies SubscribepostMeta,
    };
  });
}

async function collectDocs(): Promise<IndexDoc[]> {
  const [content, comment, subscribe, subscribepost] = await Promise.all([
    collectContentDocs(),
    collectCommentDocs(),
    collectSubscribeDocs(),
    collectSubscribepostDocs(),
  ]);
  return [...content, ...comment, ...subscribe, ...subscribepost];
}

// SCAN 游标遍历 + UNLINK 非阻塞删除（清旧索引 / 删除索引共用）
async function scanAndUnlink(pattern: string): Promise<number> {
  if (!redis) return 0;
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) {
      await redis.unlink(...keys);
      removed += keys.length;
    }
  } while (cursor !== "0");
  return removed;
}

/**
 * 全量建立/更新 Redis 倒排索引。
 * 需先确认 redis 可用（调用方检查）。locked=true 表示拿到构建锁；
 * count=-1 表示另一构建进行中；count=-2 表示未配置 Redis。
 */
export async function buildSearchIndex(): Promise<{ count: number; durationMs: number; locked: boolean }> {
  if (!redis) return { count: -2, durationMs: 0, locked: false };

  const ok = await redis.set(LOCK_KEY, "1", "EX", 60, "NX");
  const locked = ok === "OK";
  if (!locked) return { count: -1, durationMs: -1, locked };

  try {
    await setInfo(META_KEYS.status, "building");
    const start = Date.now();
    const docs = await collectDocs();

    // 清旧索引（doc + term），再全量重建
    await scanAndUnlink("idx:*");

    const docKey = (d: IndexDoc) => `${d.row_type}:${d.ref_id}`;
    // 分块 pipeline 写入，避免单次 exec 过大
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500);
      const pipe = redis.pipeline();
      for (const doc of chunk) {
        pipe.set(`${IDX_DOC}${docKey(doc)}`, JSON.stringify(doc));
        for (const token of tokenize(doc.search_text)) {
          pipe.sadd(`${IDX_TERM}${doc.row_type}:${token}`, docKey(doc));
        }
      }
      await pipe.exec();
    }

    const count = docs.length;
    await setInfo(META_KEYS.builtAt, new Date().toISOString());
    await setInfo(META_KEYS.count, String(count));
    await setInfo(META_KEYS.status, "ok");
    return { count, durationMs: Date.now() - start, locked };
  } finally {
    await redis.del(LOCK_KEY).catch(() => {});
  }
}

/** 删除索引（从缓存设置面板触发），返回被删除的键数 */
export async function deleteSearchIndex(): Promise<number> {
  const removed = await scanAndUnlink("idx:*");
  await Promise.all([
    setInfo(META_KEYS.enabled, "false"), // 一并关闭开关，避免 UI 仍显示「已启用」但搜索已回退 DB
    setInfo(META_KEYS.builtAt, "").catch(() => {}),
    setInfo(META_KEYS.count, "0").catch(() => {}),
    setInfo(META_KEYS.status, "").catch(() => {}),
  ]);
  return removed;
}

/** 用一个 row_type 倒排列表求交集，取回该类型匹配所有 token 的 docKey 集 */
async function intersectForRowType(rowType: string, tokens: string[]): Promise<string[]> {
  if (!redis || tokens.length === 0) return [];
  const keys = tokens.map((t) => `${IDX_TERM}${rowType}:${t}`);
  if (keys.length === 1) return redis.smembers(keys[0]!);
  return redis.sinter(...keys);
}

// ============ 查询：倒排索引作预筛 + search_text.includes(q) 精确复核 ============
function buildContentResult(doc: IndexDoc, q: string): ContentSearchResult {
  const meta = doc.meta as ContentMeta;
  return {
    type: "content",
    cid: meta.cid,
    title: doc.title ?? "",
    slug: meta.slug,
    desc: meta.desc,
    createTime: new Date(meta.createTime),
    categoryName: meta.categoryName,
    categorySlug: meta.categorySlug,
    highlight: highlightKeyword(doc.excerpt ?? "", q, 200),
  };
}

function buildCommentResult(doc: IndexDoc): CommentSearchResult {
  const meta = doc.meta as CommentMeta;
  return {
    type: "comment",
    coid: meta.coid,
    name: doc.title ?? "",
    content: doc.excerpt ?? "",
    avatar: meta.avatar,
    createTime: new Date(meta.createTime),
    articleTitle: meta.articleTitle,
    articleUrl: meta.articleUrl,
  };
}

function buildSubscribeResult(doc: IndexDoc): SubscribeSearchResult {
  const meta = doc.meta as SubscribeMeta;
  return {
    type: "subscribe",
    kind: meta.kind,
    id: meta.id,
    name: doc.title ?? "",
    url: meta.url,
    desc: meta.kind === "subscribe" ? null : meta.desc, // 与 live 路径一致：subscribe 不下发 desc，link 下发
    avatar: meta.avatar,
  };
}

function buildSubscribepostResult(doc: IndexDoc): SubscribePostSearchResult {
  const meta = doc.meta as SubscribepostMeta;
  return {
    type: "subscribepost",
    id: meta.id,
    subscribeId: meta.subscribeId,
    subscribeName: meta.subscribeName,
    subscribeAvatar: meta.subscribeAvatar,
    title: doc.title ?? "",
    link: meta.link,
    description: meta.description,
    author: meta.author,
    pubDate: meta.pubDate ? new Date(meta.pubDate) : null,
  };
}

const timeOf = (doc: IndexDoc): number =>
  doc.meta.kind === "content" || doc.meta.kind === "comment"
    ? new Date(doc.meta.createTime).getTime()
    : doc.meta.kind === "subscribepost"
      ? doc.meta.pubDate ? new Date(doc.meta.pubDate).getTime() : 0
      : 0;

/**
 * 用倒排索引检索（供 search.get.ts 在 isIndexReady() 为真时调用）。
 * 倒排索引只作候选预筛，最终以 search_text.includes(q) 精确复核，保证结果与 total
 * 与旧逐分支 LIKE 语义一致。索引不可用（redis 缺失）则抛错，由上层回退逐分支查询。
 */
export async function searchIndex(q: string, type: string): Promise<SearchBranchResult> {
  if (!redis) {
    throw new Error("search-index: Redis 未配置");
  }

  const rowTypes = ROW_TYPES[type] ?? ["content"];
  const tokens = tokenize(q);

  // 候选 docKey（按 row_type 分别交集，再并集）——无有效 token 视为无结果
  let candidateKeys: string[] = [];
  if (tokens.length > 0) {
    for (const rowType of rowTypes) {
      const keys = await intersectForRowType(rowType, tokens);
      if (keys.length) {
        // 并集去重（不同 row_type 的 key 前缀不同，天然不冲突）
        candidateKeys = [...candidateKeys, ...keys];
      }
    }
  }

  // 拉取 doc 记录并做精确复核
  const docs: IndexDoc[] = [];
  for (let i = 0; i < candidateKeys.length; i += 200) {
    const keys = candidateKeys.slice(i, i + 200);
    const values = await redis.mget(...keys.map((k) => `${IDX_DOC}${k}`));
    for (const v of values) {
      if (!v) continue;
      const doc = JSON.parse(v) as IndexDoc;
      if (doc.search_text.includes(q)) docs.push(doc);
    }
  }

  // 最新在前（与逐分支 create_time desc 一致）；无时间戳的 subscribe/link 排后
  docs.sort((a, b) => timeOf(b) - timeOf(a));

  const total = docs.length;
  const sliced = docs.slice(0, 50);

  const results = sliced.map((doc) => {
    switch (doc.row_type) {
      case "content":
        return buildContentResult(doc, q);
      case "comment":
        return buildCommentResult(doc);
      case "subscribepost":
        return buildSubscribepostResult(doc);
      default:
        return buildSubscribeResult(doc);
    }
  });

  return { results, total };
}
