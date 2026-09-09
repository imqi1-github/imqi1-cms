import { XMLParser } from "fast-xml-parser";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { prisma } from "./prisma";

import { invalidateContentCaches } from "#server/utils/content-cache";
import { fetchPublicUrl } from "#server/utils/safe-fetch";
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "_",
  textNodeName: "#text",
});

// 提取文本内容（处理解析后的对象或字符串）
function getTextValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "#text" in value && typeof value["#text"] === "string") return value["#text"];
  return String(value);
}

// 截断文本并添加省略号
function truncateWithEllipsis(text: string | undefined, maxLength: number): string | undefined {
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

// fetchSubscribePosts 的判别联合返回类型：让调用方能按 success 字面量收窄（否则 success 扩成 boolean 无法收窄 count/error）
type FetchPostsResult =
  | { success: true; count: number; latestTitle: string | null }
  | { success: false; error: string };

// 获取单个订阅源的文章
async function fetchSubscribePosts(subscribeId: number, url: string): Promise<FetchPostsResult> {
  console.log(`[订阅更新] 开始获取订阅 ${subscribeId}: ${url}`);
  try {
    // 安全外联：校验公网 + 钉定已校验 IP（封 DNS rebinding），统一 redirect:"error" 与 30s 超时
    const xmlText = await fetchPublicUrl(
      url,
      async response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      },
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS Reader)" } },
      30000,
    );

    console.log(`[订阅更新] 订阅 ${subscribeId} XML 内容长度: ${xmlText.length}`);
    const feed = parser.parse(xmlText);

    const items: Array<{
      title: string;
      link: string;
      description?: string;
      content?: string;
      author?: string;
      pubDate?: Date;
    }> = [];

    // 处理 RSS 格式
    if (feed.rss?.channel?.item) {
      const rssItems = Array.isArray(feed.rss.channel.item) ? feed.rss.channel.item : [feed.rss.channel.item];
      for (const item of rssItems) {
        // 处理 atom:link 可能是数组
        let link = getTextValue(item.link);
        if (!link && item["atom:link"]) {
          const atomLinks = Array.isArray(item["atom:link"]) ? item["atom:link"] : [item["atom:link"]];
          for (const al of atomLinks) {
            if (al._href) {
              link = al._href;
              break;
            }
          }
        }

        const pub = getTextValue(item.pubDate);
        const pubDate = pub ? new Date(pub) : undefined;
        items.push({
          title: getTextValue(item.title) || "Untitled",
          link: link || "",
          description: getTextValue(item.description),
          content: getTextValue(item["content:encoded"]) || getTextValue(item.content),
          author: getTextValue(item.author) || getTextValue(item["dc:creator"]),
          pubDate: pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate : undefined,
        });
      }
    }
    // 处理 Atom 格式
    else if (feed.feed?.entry) {
      const atomEntries = Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];
      for (const entry of atomEntries) {
        // 处理 link 可能是数组或对象
        let link = "";
        if (Array.isArray(entry.link)) {
          for (const l of entry.link) {
            if (l._href) {
              link = l._href;
              break;
            }
          }
        } else if (entry.link) {
          link = entry.link._href || getTextValue(entry.link);
        }

        // 处理 author
        let author = "";
        if (entry.author) {
          if (Array.isArray(entry.author)) {
            author = getTextValue(entry.author[0]?.name) ?? "";
          } else {
            author = getTextValue(entry.author.name) ?? "";
          }
        }

        // 处理日期
        const dateValue = getTextValue(entry.published) || getTextValue(entry.updated);
        const atomPubDate = dateValue ? new Date(dateValue) : undefined;

        items.push({
          title: getTextValue(entry.title) || "Untitled",
          link: link || "",
          description: getTextValue(entry.summary),
          content: getTextValue(entry.content),
          author: author,
          pubDate: atomPubDate && !Number.isNaN(atomPubDate.getTime()) ? atomPubDate : undefined,
        });
      }
    }

    // 检查是否成功解析到文章
    if (items.length === 0) {
      console.warn(`[订阅更新] 订阅 ${subscribeId} 未解析到任何文章，可能不是标准的 RSS/Atom 格式`);
      return { success: false, error: "未解析到任何文章，请检查 RSS 源格式" };
    }

    // 每个订阅源最多保存10篇文章
    const contentsToSave = items.slice(0, 10);
    console.log(`[订阅更新] 订阅 ${subscribeId} 解析到 ${items.length} 篇文章，将保存前 ${contentsToSave.length} 篇`);

    for (const item of contentsToSave) {
      if (!item.link) continue;

      // 写库前 sanitize（纵深防御）：把过滤固化到写入侧，否则外部 RSS 源可注入 javascript:/data: 链接，
      // 一旦某消费方（读取侧）忘记 sanitize 即触发存储型 XSS。非 http(s) 链接丢空 → continue
      const safeLink = sanitizeExternalUrl(item.link);
      if (!safeLink) continue;

      try {
        await prisma.subscribeposts.upsert({
          where: { link: safeLink },
          create: {
            subscribeId,
            title: item.title,
            link: safeLink,
            description: truncateWithEllipsis(item.description, 1000), // 限制描述长度并添加省略号
            content: truncateWithEllipsis(item.content, 5000), // 限制内容长度并添加省略号
            author: item.author,
            pubDate: item.pubDate,
          },
          update: {}, // 已存在则不更新
        });
      } catch (error) {
        console.error(error);
        // 忽略重复链接错误
        if (error instanceof PrismaClientKnownRequestError && error.code.includes("P2002")) continue;
        throw error;
      }
    }

    // 更新订阅源的最后更新时间
    await prisma.subscribes.update({
      where: { id: subscribeId },
      data: { lastUpdated: new Date() },
    });

    // 最新文章标题：取 pubDate 最大那篇（无日期用首个），供表格状态列展示
    let latest: (typeof items)[number] | null = null;
    for (const it of items) {
      if (!latest || (it.pubDate?.getTime() ?? 0) > (latest.pubDate?.getTime() ?? 0)) latest = it;
    }
    const latestTitle = latest?.title ?? items[0]?.title ?? null;

    console.log(`[订阅更新] 订阅 ${subscribeId} 更新成功，获取了 ${contentsToSave.length} 篇文章`);
    return { success: true, count: contentsToSave.length, latestTitle };
  } catch (error) {
    console.error(error);
    return { success: false, error: (error as Error).message };
  }
}

// 并发抓取上限：订阅源多了若逐个 await，总耗时≈各源耗时之和，极易超出请求超时。
// 并行 + 固定并发上限既压到约「单源最慢 × 批次」，又不无限打爆外联连接/惹源站点限流。
const FETCH_CONCURRENCY = 5;

// 以固定并发上限运行 worker；完成顺序不定，仅保证每个任务都会执行（用于并行抓取订阅源）。
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]!);
    }
  });
  await Promise.all(workers);
}

// 会话内（内存）订阅更新统计：重启自动归零，不做持久化（单实例站点足够，跨实例共享需另接持久层）。
// updateCount 为累计更新次数；lastRunAt 为最近一次完成时间；成功/失败只留最近一次的值（每次覆盖）。
const subscriptionStats = {
  updateCount: 0,
  lastRunAt: null as number | null,
  successCount: 0,
  failureCount: 0,
};

export function getSubscriptionStats() {
  return {
    updateCount: subscriptionStats.updateCount,
    lastRunAt: subscriptionStats.lastRunAt,
    successCount: subscriptionStats.successCount,
    failureCount: subscriptionStats.failureCount,
  };
}

// 每个订阅源「最近一次更新」的状态（键为 subscribeId）：刷新时在表格状态列展示。重启归零，不持久化。
type SubscribeRunStatus = {
  success: boolean;
  message: string;
  articleCount: number;
  latestTitle: string | null;
  updatedAt: number;
};
const lastRunSourceStatus = new Map<number, SubscribeRunStatus>();

export function getSourceStatus(subscribeId: number): SubscribeRunStatus | null {
  return lastRunSourceStatus.get(subscribeId) ?? null;
}

// 更新所有订阅（并行抓取，固定并发上限）
export async function updateAllSubscribes() {
  console.log("[订阅更新] 开始更新所有订阅");
  const subscribes = await prisma.subscribes.findMany();
  console.log(`[订阅更新] 找到 ${subscribes.length} 个订阅源`);

  const results = {
    success: 0,
    failed: 0,
    total: subscribes.length,
    details: [] as Array<{ name: string; success: boolean; message?: string }>,
  };

  // 成功/失败用计数器累加（JS 单线程，await 之间同步自增无竞态）；details 按完成顺序追加，汇总只用前面的总数。
  let succeeded = 0;

  await runWithConcurrency(subscribes, FETCH_CONCURRENCY, async subscribe => {
    console.log(`[订阅更新] 正在处理: ${subscribe.name}`);
    const result = await fetchSubscribePosts(subscribe.id, subscribe.url);
    results.details.push({
      name: subscribe.name,
      success: result.success,
      message: result.success ? `获取 ${result.count} 篇文章` : result.error,
    });
    // 记录最近一次状态（覆盖）：成功带文章数+最新标题，失败带错误信息
    lastRunSourceStatus.set(subscribe.id, {
      success: result.success,
      message: result.success ? `获取 ${result.count} 篇文章` : (result.error ?? "未知错误"),
      articleCount: result.success ? result.count : 0,
      latestTitle: result.success ? (result.latestTitle ?? null) : null,
      updatedAt: Date.now(),
    });
    if (result.success) succeeded++;
  });

  results.success = succeeded;
  results.failed = results.total - results.success;

  // 会话内统计：次数累计；成功/失败只留最近一次（覆盖）
  subscriptionStats.updateCount += 1;
  subscriptionStats.lastRunAt = Date.now();
  subscriptionStats.successCount = results.success;
  subscriptionStats.failureCount = results.failed;

  console.log(`[订阅更新] 更新完成: 成功 ${results.success}/${results.total}，失败 ${results.failed}`);

  // 订阅内容已更新 → 失效订阅页 / 首页(订阅文章) / 地图页(博客网络) ISR 缓存（best-effort，不阻塞也不失败）
  await invalidateContentCaches({ routes: ["/", "/subscribes", "/map"] }).catch(err => console.error("[cache] 订阅同步失效缓存失败", err));

  return results;
}

// 获取订阅文章列表（每人最多10篇，总共最多30篇）
// 仅允许 http/https 外链：防止 RSS 投毒的 javascript:/data: 等协议在点击时执行（存储型 XSS）。
// 导出供搜索等其它消费 RSS 外链的模块复用（如 /api/search 订阅文章类别）。
export function sanitizeExternalUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // 非合法 URL，忽略
  }
  return "";
}

export async function getSubscribePosts() {
  // 获取所有有文章的订阅源
  const subscribesWithPosts = await prisma.subscribes.findMany({
    where: {
      subscribeposts: {
        some: {},
      },
    },
    include: {
      subscribeposts: {
        orderBy: { pubDate: "desc" },
        take: 10,
      },
    },
    orderBy: {
      lastUpdated: "desc",
    },
  });

  // 收集所有文章并按发布日期排序
  const allContents: Array<{
    id: number;
    subscribeId: number;
    subscribeName: string;
    subscribeAvatar: string | null;
    title: string;
    link: string;
    description: string | null;
    pubDate: Date | null;
  }> = [];

  for (const subscribe of subscribesWithPosts) {
    for (const item of subscribe.subscribeposts) {
      allContents.push({
        id: item.id,
        subscribeId: subscribe.id,
        subscribeName: subscribe.name,
        subscribeAvatar: subscribe.avatar,
        title: item.title,
        link: sanitizeExternalUrl(item.link),
        description: item.description,
        pubDate: item.pubDate,
      });
    }
  }

  // 按发布日期降序排序，取前30篇
  allContents.sort((a, b) => {
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return b.pubDate.getTime() - a.pubDate.getTime();
  });

  return allContents.slice(0, 30);
}
