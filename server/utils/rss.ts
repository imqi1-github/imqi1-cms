import { XMLParser } from 'fast-xml-parser';
import { prisma } from './prisma';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '_',
  textNodeName: '#text',
});

// 提取文本内容（处理解析后的对象或字符串）
function getTextValue(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value['#text']) return value['#text'];
  return String(value);
}

// 带超时的fetch
async function fetchWithTimeout(url: string, timeout = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 获取单个订阅源的文章
async function fetchSubscribePosts(subscribeId: number, url: string) {
  try {
    const response = await fetchWithTimeout(url, 30000);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xmlText = await response.text();
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
        if (!link && item['atom:link']) {
          const atomLinks = Array.isArray(item['atom:link']) ? item['atom:link'] : [item['atom:link']];
          for (const al of atomLinks) {
            if (al._href) {
              link = al._href;
              break;
            }
          }
        }

        items.push({
          title: getTextValue(item.title) || 'Untitled',
          link: link || '',
          description: getTextValue(item.description),
          content: getTextValue(item['content:encoded']) || getTextValue(item.content),
          author: getTextValue(item.author) || getTextValue(item['dc:creator']),
          pubDate: getTextValue(item.pubDate) ? new Date(getTextValue(item.pubDate)!) : undefined,
        });
      }
    }
    // 处理 Atom 格式
    else if (feed.feed?.entry) {
      const atomEntries = Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];
      for (const entry of atomEntries) {
        // 处理 link 可能是数组或对象
        let link = '';
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
        let author = '';
        if (entry.author) {
          if (Array.isArray(entry.author)) {
            author = getTextValue(entry.author[0]?.name);
          } else {
            author = getTextValue(entry.author.name);
          }
        }

        // 处理日期
        const dateValue = getTextValue(entry.published) || getTextValue(entry.updated);

        items.push({
          title: getTextValue(entry.title) || 'Untitled',
          link: link || '',
          description: getTextValue(entry.summary),
          content: getTextValue(entry.content),
          author: author,
          pubDate: dateValue ? new Date(dateValue) : undefined,
        });
      }
    }

    // 每个订阅源最多保存10篇文章
    const postsToSave = items.slice(0, 10);

    for (const item of postsToSave) {
      if (!item.link) continue;

      try {
        await prisma.subscribePost.upsert({
          where: { link: item.link },
          create: {
            subscribeId,
            title: item.title,
            link: item.link,
            description: item.description?.substring(0, 1000), // 限制描述长度
            content: item.content?.substring(0, 5000), // 限制内容长度
            author: item.author,
            pubDate: item.pubDate,
          },
          update: {}, // 已存在则不更新
        });
      } catch (error) {
        // 忽略重复链接错误
        if ((error as any).code?.includes('P2002')) continue;
        throw error;
      }
    }

    // 更新订阅源的最后更新时间
    await prisma.subscribe.update({
      where: { id: subscribeId },
      data: { lastUpdated: new Date() },
    });

    return { success: true, count: postsToSave.length };
  } catch (error) {
    console.error(`获取订阅 ${subscribeId} 失败:`, error);
    return { success: false, error: (error as Error).message };
  }
}

// 更新所有订阅
export async function updateAllSubscribes() {
  const subscribes = await prisma.subscribe.findMany();

  const results = {
    success: 0,
    failed: 0,
    total: subscribes.length,
    details: [] as Array<{ name: string; success: boolean; message?: string }>,
  };

  for (const subscribe of subscribes) {
    const result = await fetchSubscribePosts(subscribe.id, subscribe.url);
    results.details.push({
      name: subscribe.name,
      success: result.success,
      message: result.success ? `获取 ${result.count} 篇文章` : result.error,
    });

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }
  }

  return results;
}

// 获取订阅文章列表（每人最多10篇，总共最多30篇）
export async function getSubscribePosts() {
  // 获取所有有文章的订阅源
  const subscribesWithPosts = await prisma.subscribe.findMany({
    where: {
      posts: {
        some: {},
      },
    },
    include: {
      posts: {
        orderBy: { pubDate: 'desc' },
        take: 10,
      },
    },
    orderBy: {
      lastUpdated: 'desc',
    },
  });

  // 收集所有文章并按发布日期排序
  const allPosts: Array<{
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
    for (const post of subscribe.posts) {
      allPosts.push({
        id: post.id,
        subscribeId: subscribe.id,
        subscribeName: subscribe.name,
        subscribeAvatar: subscribe.avatar,
        title: post.title,
        link: post.link,
        description: post.description,
        pubDate: post.pubDate,
      });
    }
  }

  // 按发布日期降序排序，取前30篇
  allPosts.sort((a, b) => {
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return b.pubDate.getTime() - a.pubDate.getTime();
  });

  return allPosts.slice(0, 30);
}
