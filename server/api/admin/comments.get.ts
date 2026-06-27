import { createHash } from "node:crypto";

import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { getIpLocation } from "#server/utils/qqwry";

// 生成 Gravatar 头像 URL
function getAvatarUrl(email: string | null): string | null {
  if (!email) return null;

  const hash = createHash("md5").update(email.toLowerCase().trim()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`;
}

// 处理 location 格式：只显示城市，没有城市则显示省份
function formatLocation(location: string): string {
  if (!location) return "";

  // 去掉"中国"前缀；若 IP 数据只能定位到国家级，则保底显示「中国」。
  const loc = location.replace(/^中国[–—-]?/, "");
  if (!loc.trim() && location.startsWith("中国")) return "中国";

  // 按"–"或"—"或"-"分割
  const parts = loc.split(/[–—-]/).map(p => p.trim()).filter(p => p);

  if (parts.length === 0) return "";

  // 优先返回城市（第2部分），没有城市则返回省份（第1部分）
  let result: string;
  if (parts.length >= 2) {
    result = parts[1] ?? ""; // 例如：辽宁-沈阳-沈河区 → 沈阳
  } else {
    result = parts[0] ?? ""; // 只有省份，例如：辽宁
  }

  // 去掉行政区划后缀
  result = result
    .replace(/(市|区|县|镇|乡|街道|地区|开发区|高新区|新区|新城|自治区|自治州|盟|旗)$/g, "")
    .replace(/(特别行政区)$/g, "特区"); // 香港/澳门特别行政区 → 特区

  return result;
}

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  try {
    const query = getQuery(event);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const cid = query.cid ? Number(query.cid) : null;

    // 构建查询条件
    const where = cid ? { cid } : {};

    const [comments, total] = await Promise.all([
      prisma.comments.findMany({
        where,
        orderBy: { create_time: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          coid: true,
          cid: true,
          name: true,
          mail: true,
          link: true,
          content: true,
          create_time: true,
          status: true,
          parent_id: true,
          agent: true,
          ip: true,
          posts: {
            select: {
              cid: true,
              title: true,
              slug: true,
              postrelations: {
                where: { metas: { type: "category" } },
                select: { metas: { select: { slug: true } } },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.comments.count({ where }),
    ]);

    // IP 归属地缓存
    const ipLocationCache = new Map<string, { location: string; isp: string }>();

    // 批量查询 IP 归属地
    for (const comment of comments) {
      if (comment.ip && !ipLocationCache.has(comment.ip)) {
        const location = await getIpLocation(comment.ip);
        ipLocationCache.set(comment.ip, location || { location: "", isp: "" });
      }
    }

    // 在服务端生成头像 URL 和添加归属地信息
    const commentsWithAvatar = comments.map(comment => {
      const ipInfo = ipLocationCache.get(comment.ip || "");
      return {
        ...comment,
        avatarUrl: getAvatarUrl(comment.mail),
        location: formatLocation(ipInfo?.location || ""),
        isp: ipInfo?.isp || "",
      };
    });

    return {
      data: commentsWithAvatar,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取评论列表失败",
    });
  }
});
