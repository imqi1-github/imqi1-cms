import { createHash } from "node:crypto";

import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { getIpLocation } from "#server/utils/qqwry";

// 生成评论头像 URL（根据后台配置的头像服务镜像）
function getAvatarUrl(email: string | null, service: string): string | null {
  if (!email) return null;

  const serviceUrls: Record<string, string> = {
    gravatar: "https://www.gravatar.com/avatar",
    cravatar: "https://cn.cravatar.com/avatar",
    weavatar: "https://weavatar.com/avatar",
  };
  const baseUrl = serviceUrls[service] || serviceUrls.gravatar;
  const hash = createHash("md5").update(email.toLowerCase().trim()).digest("hex");
  return `${baseUrl}/${hash}?d=identicon&s=80`;
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

  // 去行政区划后缀。特别行政区先转「特区」（要先于普通后缀，否则会被 /(区)$/ 整体剥成香港/澳门）；
  // 再用负向断言跳过「特区」结尾的区，避免「香港特区」被剥成「香港特」。
  result = result
    .replace(/(特别行政区)$/g, "特区")
    .replace(/(?<!特)(市|县|镇|乡|街道|地区|开发区|高新区|新区|新城|自治区|自治州|盟|旗|区)$/g, "");

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
    // 负数/浮点 page 会让 skip/take 为负/非整数被 Prisma 抛错 → 整单 500；floor + 上下限钳制（含上限，防海量 take）
    const page = Math.min(10000, Math.max(1, Math.floor(Number(query.page) || 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 10)));
    const cid = Number.isInteger(Number(query.cid)) ? Number(query.cid) : null;

    // 状态筛选：status 为 0/1/2 时按精确状态过滤，未传或 "all" 表示全部
    const statusRaw = query.status;
    let statusValue: number | null = null;
    if (statusRaw !== undefined && statusRaw !== "all" && statusRaw !== "") {
      const parsed = Number(statusRaw);
      if (Number.isInteger(parsed) && [0, 1, 2].includes(parsed)) {
        statusValue = parsed;
      }
    }

    // 构建查询条件（状态筛选与文章筛选叠加）
    const where = {
      ...(statusValue !== null ? { status: statusValue } : {}),
      ...(cid ? { cid } : {}),
    };

    // 读取后台配置的头像服务（默认 gravatar）
    const avatarSetting = await prisma.informations.findUnique({ where: { key: "commentAvatarService" } });
    const avatarService = avatarSetting?.value || "gravatar";

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
          content_ref: {
            select: {
              cid: true,
              title: true,
              slug: true,
              contentrelations: {
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

    // IP 归属地缓存：先收集不重复的 IP，再并行查询（避免逐条串行 await）
    const ipLocationCache = new Map<string, { location: string; isp: string }>();
    const uniqueIps = [...new Set(comments.map(c => c.ip).filter((ip): ip is string => Boolean(ip)))];
    const ipResults = await Promise.all(
      uniqueIps.map(async ip => [ip, (await getIpLocation(ip)) || { location: "", isp: "" }] as const)
    );
    for (const [ip, location] of ipResults) {
      ipLocationCache.set(ip, location);
    }

    // 在服务端生成头像 URL 和添加归属地信息
    const commentsWithAvatar = comments.map(comment => {
      const ipInfo = ipLocationCache.get(comment.ip || "");
      const { content_ref, ...rest } = comment;
      return {
        ...rest,
        contents: content_ref, // 保持前端契约：关联文章仍以 contents 返回
        avatarUrl: getAvatarUrl(comment.mail, avatarService),
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
