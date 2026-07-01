import { createHash } from "node:crypto";

import { resolveCity } from "#server/utils/ip-location";
import { prisma } from "#server/utils/prisma";
import { CITY_COORDS } from "~~/shared/city-coords";
import type { Reader } from "#server/types/apis/reader";

/**
 * 读者足迹（访客分布）聚合端点
 *
 * 把已审核评论的 IP 归属地聚合成「城市 + 读者列表」，供 /map 的「访客分布」视图打点。
 *
 * 去重：按**读者身份**计一位访客——邮箱优先（同一人换 IP / 换设备 / 手机+家里仍算一位），
 * 无邮箱则用「昵称+网址」（无邮箱的博主跨 IP 合并），再无则退回 IP（纯匿名）。
 * 每个身份取其**最新一条国内评论**的昵称/网址/文章，落在该评论 IP 解析出的城市
 * （走 VPN / 临时出国产生的境外评论不作为落点，避免读者从国内地图消失）。
 *
 * 隐私：昵称 / 网址 / 评论文章 / 最后一条评论正文本就通过评论列表公开（与 /api/recent-comments
 * 同口径），可暴露；**绝不返回**原始 IP / 邮箱（邮箱仅内部用作去重键，不进输出）。
 * 境外与解析不出的归入计数桶（overseas / unknown），不打点。
 */

/** 把评论正文压成一行短摘要：去 HTML 标签/实体、折叠空白、截断。 */
function commentSnippet(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function avatarUrl(mail: string | null, service: string): string | null {
  if (!mail) return null;
  const hash = createHash("md5").update(mail.toLowerCase().trim()).digest("hex");
  const serviceUrls: Record<string, string> = {
    gravatar: "https://www.gravatar.com/avatar",
    cravatar: "https://cn.cravatar.com/avatar",
    weavatar: "https://weavatar.com/avatar",
  };
  const baseUrl = serviceUrls[service] || serviceUrls.gravatar;
  return `${baseUrl}/${hash}?d=identicon&s=80`;
}

function isMeaningfulName(name: string): boolean {
  if (!name) return false;
  return !/^(匿名|匿名读者|游客|访客|路人|佚名)$/i.test(name.trim());
}

export default defineEventHandler(async () => {
  const avatarSetting = await prisma.informations.findUnique({ where: { key: "commentAvatarService" } });
  const avatarService = avatarSetting?.value || "gravatar";

  // 取 ip + 昵称(name) + 网址(link) + 邮箱(mail，仅去重用) + coid + 正文(content) + 关联文章；
  // 按时间倒序，使每个身份遍历时首条即其最新评论。
  const rows = await prisma.comments.findMany({
    where: { status: 1, ip: { not: null } },
    select: {
      ip: true,
      name: true,
      link: true,
      mail: true,
      coid: true,
      content: true,
      posts: {
        select: {
          title: true,
          slug: true,
          postrelations: { select: { metas: { select: { slug: true } } }, take: 1 },
        },
      },
    },
    orderBy: { create_time: "desc" },
  });

  // 预扫一遍：为昵称相关键记录其出现过的邮箱（取最新一条）。这样同一个人偶尔漏填邮箱
  // 或换网址时，能并到他惯用的邮箱身份里，而不是另立身份。昵称单键只用于非泛化昵称。
  const nlToMail = new Map<string, string>();
  const nameToMail = new Map<string, string>();
  for (const row of rows) {
    const name = row.name?.trim() || "";
    const link = row.link?.trim().toLowerCase() || "";
    const mail = row.mail?.trim().toLowerCase() || null;
    if (!name || !mail) continue;
    if (link && !nlToMail.has(`${name}|${link}`)) nlToMail.set(`${name}|${link}`, mail);
    if (isMeaningfulName(name) && !nameToMail.has(name)) nameToMail.set(name, mail);
  }

  // 读者身份去重键：邮箱 > 昵称+网址/昵称命中的邮箱 > 非泛化昵称 > 昵称+网址 > IP。
  // 同一个人换 IP/换设备只算一位。
  // 落点取该身份「最新的国内评论」所在城市——避免读者走 VPN（IP 解析成境外）或临时出国时
  // 从国内地图凭空消失。境外/坐标解析不出的身份仅当其**没有任何可落点的国内评论**时，
  // 才计入 overseas / unknown 桶。
  type IdStatus = "placed" | "unknown" | "overseas";
  const RANK: Record<IdStatus, number> = { placed: 3, unknown: 2, overseas: 1 };
  const idStatus = new Map<string, IdStatus>();
  const tally = new Map<string, { readers: Reader[]; longitude: number; latitude: number }>();

  for (const row of rows) {
    const ip = row.ip;
    if (!ip) continue;

    const mail = row.mail?.trim().toLowerCase() || null;
    const readerName = row.name?.trim() || "";
    const link = row.link?.trim().toLowerCase() || null;
    const nlKey = readerName && link ? `${readerName}|${link}` : null;
    // 非泛化昵称优先：同一个读者换邮箱/网址/IP 后仍只算一位（如「刘郎」有多个邮箱）。
    // 泛化昵称不按昵称合并，避免把不同「匿名/游客」误合成一位。
    const identity = isMeaningfulName(readerName)
      ? `name:${readerName}`
      : (mail ?? (nlKey ? nlToMail.get(nlKey) : null) ?? (nlKey ? `nl:${nlKey}` : `ip:${ip}`));

    // 已落点（已找到更新的国内可落点评论）：跳过该身份其余更旧的行
    if (idStatus.get(identity) === "placed") continue;

    const info = await resolveCity(ip);

    let next: IdStatus;
    if (!info.isDomestic) {
      next = "overseas";
    } else {
      // 城市坐标缺失时回退到省份质心，并入省份桶，避免重叠打点
      const cityCoord = info.city ? CITY_COORDS[info.city] : undefined;
      const name = cityCoord ? info.city : info.province;
      const coord = cityCoord ?? (info.province ? CITY_COORDS[info.province] : undefined);
      if (!name || !coord) {
        next = "unknown";
      } else {
        next = "placed";
        // 文章链接：普通文章走 /content/<分类slug>/<文章slug>#comment-<coid>；留言板文章走 /messages#comment-<coid>。
        const categorySlug = row.posts?.postrelations?.[0]?.metas?.slug ?? null;
        const postSlug = row.posts?.slug ?? null;
        const isMessagePost = postSlug === "messages";
        const articleUrl = isMessagePost
          ? `/messages#comment-${row.coid}`
          : categorySlug && postSlug
            ? `/content/${categorySlug}/${postSlug}#comment-${row.coid}`
            : null;
        const articleTitle = isMessagePost ? "留言板" : (row.posts?.title ?? null);

        const reader: Reader = {
          name: row.name?.trim() || "匿名读者",
          url: row.link?.trim() || null,
          articleTitle,
          articleUrl,
          comment: commentSnippet(row.content),
          avatar: avatarUrl(mail, avatarService),
        };

        const ex = tally.get(name);
        if (ex) ex.readers.push(reader);
        else tally.set(name, { readers: [reader], longitude: coord[0], latitude: coord[1] });
      }
    }

    // 优先级 placed > unknown > overseas：仅更高优先级才覆盖
    // （后续遇到更新的国内可落点评论时，把之前因 VPN/无坐标临时记的 overseas/unknown 升级为 placed）
    const cur = idStatus.get(identity);
    if (!cur || RANK[next] > RANK[cur]) idStatus.set(identity, next);
  }

  let overseas = 0;
  let unknown = 0;
  for (const st of idStatus.values()) {
    if (st === "overseas") overseas++;
    else if (st === "unknown") unknown++;
  }

  // 按读者数降序，id 用稳定 1..n 序号（TravelMap 聚合点击按 id 反查 place）
  const points = [...tally.entries()]
    .sort((a, b) => b[1].readers.length - a[1].readers.length)
    .map(([name, v], i) => ({
      id: i + 1,
      name,
      count: v.readers.length,
      longitude: v.longitude,
      latitude: v.latitude,
      readers: v.readers,
    }));

  return {
    success: true,
    data: { points, overseas, unknown, total: idStatus.size },
  };
});
