import { createHash } from "node:crypto";

import { siteConfig } from "~~/site.config";
import type { MiniComment, MiniCommentsResponse } from "#server/types/apis/mini";
import { prisma } from "#server/utils/prisma";

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;
const month = 30 * day;
const year = 365 * day;

function formatRelativeTime(value: Date) {
  const diff = Date.now() - value.getTime();

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < week) return `${Math.floor(diff / day)} 天前`;
  if (diff < month) return `${Math.floor(diff / week)} 周前`;
  if (diff < year) return `${Math.floor(diff / month)} 个月前`;

  return `${Math.floor(diff / year)} 年前`;
}

// 头像直接返回镜像站地址（与主站 footprint 一致），端上 <image> 直连；
// 需在小程序合法域名白名单里加入所用镜像站域名（gravatar/cravatar/weavatar）。
const avatarServiceUrls: Record<string, string> = {
  gravatar: "https://www.gravatar.com/avatar",
  cravatar: "https://cn.cravatar.com/avatar",
  weavatar: "https://weavatar.com/avatar",
};

function avatarUrl(mail: string | null, service: string): string {
  if (!mail) return "";

  const hash = createHash("md5").update(mail.toLowerCase().trim()).digest("hex");
  const baseUrl = avatarServiceUrls[service] || avatarServiceUrls.gravatar;

  return `${baseUrl}/${hash}?d=identicon&s=80`;
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=60, s-maxage=60");

  // 评论功能总开关：关闭时直接返回空列表，端上据此不渲染评论区。
  if (!siteConfig.features.miniComment) {
    return { success: true, data: [], total: 0, requireMail: true, requireLink: false } satisfies MiniCommentsResponse;
  }

  const query = getQuery(event);
  const cid = Number(query.cid);

  if (!cid || !Number.isInteger(cid) || cid <= 0) {
    throw createError({
      statusCode: 400,
      message: "缺少或非法的文章 id",
    });
  }

  try {
    // 表单必填项跟随主站设置：commentRequireMail 默认 true、commentRequireLink 默认 false；
    // 头像服务与主站共用一份后台设置（commentAvatarService）。
    const [mailMeta, linkMeta, avatarMeta] = await Promise.all([
      prisma.informations.findUnique({ where: { key: "commentRequireMail" } }),
      prisma.informations.findUnique({ where: { key: "commentRequireLink" } }),
      prisma.informations.findUnique({ where: { key: "commentAvatarService" } }),
    ]);
    const requireMail = mailMeta ? mailMeta.value === "true" : true;
    const requireLink = linkMeta ? linkMeta.value === "true" : false;
    const avatarService = avatarMeta?.value || "gravatar";

    // 仅取审核通过（status: 1）的评论，按时间正序，端上再自行构建树。
    const rows = await prisma.comments.findMany({
      where: { cid, status: 1 },
      orderBy: { create_time: "asc" },
      select: {
        coid: true,
        name: true,
        mail: true,
        content: true,
        create_time: true,
        parent_id: true,
      },
    });

    // 构建评论树：先建节点映射，再按 parent_id 挂到父节点 children 下。
    const nodeMap = new Map<number, MiniComment>();
    const roots: MiniComment[] = [];

    for (const row of rows) {
      nodeMap.set(row.coid, {
        id: row.coid,
        name: row.name,
        content: row.content,
        avatar: avatarUrl(row.mail, avatarService),
        publishedAt: formatRelativeTime(row.create_time),
        created: row.create_time.toISOString(),
        parentName: null,
        children: [],
      });
    }

    for (const row of rows) {
      const node = nodeMap.get(row.coid);
      if (!node) continue;

      if (row.parent_id) {
        const parent = nodeMap.get(row.parent_id);
        // 父评论存在（未被删除/未过审）时挂为子级，否则降级为根评论。
        if (parent) {
          node.parentName = parent.name;
          parent.children.push(node);
          continue;
        }
      }

      roots.push(node);
    }

    // 根评论按时间倒序（最新在前）；子回复保持 asc 的阅读顺序不变。
    roots.reverse();

    return {
      success: true,
      data: roots,
      total: rows.length,
      requireMail,
      requireLink,
    } satisfies MiniCommentsResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序评论列表失败",
    });
  }
});
