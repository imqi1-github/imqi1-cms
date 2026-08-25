import type { MiniLinksResponse } from "#server/types/apis/mini";
import { prisma } from "#server/utils/prisma";

// 从 url 取注册域名（补协议、去端口、去 www. 前缀）作为去重键；与主站 blog-network 一致。
function domainOf(url: string): string | null {
  if (!url) return null;

  try {
    // 用真正的 scheme 前缀正则判定是否已带协议：url.startsWith("http")（大小写敏感）会把
    // 无协议裸主机名（如 httpbin.org）或大写 HTTP://… 误判为已带协议，交给 new URL 后抛错、
    // 静默丢弃合法域名。与主站 blog-network 保持一致的修复版本。
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const [links, subscribes] = await Promise.all([
      prisma.links.findMany({
        // 排除未审核的修改请求（与主站 links.get 保持一致）。
        where: {
          enabled: true,
          OR: [
            { isModification: false },
            { isModification: true, modificationStatus: "approved" },
          ],
        },
        select: { id: true, name: true, link: true, avatar: true },
      }),
      prisma.subscribes.findMany({
        select: { id: true, name: true, url: true, avatar: true },
      }),
    ]);

    // 按域名去重合并：友链优先（重复域名以友链为主），订阅补充未出现的域名。
    const byDomain = new Map<string, MiniLinksResponse["data"][number]>();

    for (const l of links) {
      const d = domainOf(l.link);
      if (!d || byDomain.has(d)) continue;
      byDomain.set(d, {
        key: `link-${l.id}`,
        source: "link",
        name: l.name,
        url: l.link,
        avatar: l.avatar ?? "",
      });
    }

    for (const s of subscribes) {
      const d = domainOf(s.url);
      if (!d || byDomain.has(d)) continue;
      byDomain.set(d, {
        key: `subscribe-${s.id}`,
        source: "subscribe",
        name: s.name,
        url: s.url,
        avatar: s.avatar ?? "",
      });
    }

    return {
      success: true,
      data: [...byDomain.values()],
    } satisfies MiniLinksResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序链接列表失败",
    });
  }
});
