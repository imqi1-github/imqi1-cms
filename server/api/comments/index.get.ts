import { prisma } from "#server/utils/prisma";
import { getIpLocation } from "#server/utils/qqwry";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const cid = parseInt(query.cid as string);
    const page = parseInt(query.page as string) || 1;
    const pageSize = parseInt(query.pageSize as string) || 10;

    if (!cid) {
      throw createError({
        statusCode: 400,
        message: "缺少文章ID参数",
      });
    }

    // IP 归属地缓存
    const ipLocationCache = new Map<string, { location: string; isp: string }>();

    const comments = await prisma.comments.findMany({
      where: {
        cid,
        status: 1,
      },
      orderBy: {
        create_time: "desc",
      },
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
      },
    });

    const commentMap = new Map<number, any>();
    const rootComments: any[] = [];

    // 批量查询 IP 归属地
    for (const comment of comments) {
      if (comment.ip && !ipLocationCache.has(comment.ip)) {
        const location = await getIpLocation(comment.ip);
        ipLocationCache.set(comment.ip, location || { location: "", isp: "" });
      }
    }

    // 处理 location 格式：只显示城市，没有城市则显示省份
    const formatLocation = (location: string): string => {
      if (!location) return "";

      // 去掉"中国"前缀；若 IP 数据只能定位到国家级，则保底显示「中国」。
      let loc = location.replace(/^中国[–—\-]?/, "");
      if (!loc.trim() && location.startsWith("中国")) return "中国";

      // 按"–"或"—"或"-"分割
      const parts = loc.split(/[–—\-]/).map(p => p.trim()).filter(p => p);

      if (parts.length === 0) return "";

      // 优先返回城市（第2部分），没有城市则返回省份（第1部分）
      // parts[0] 通常是省份，parts[1] 通常是城市，parts[2] 是区县
      let result = "";
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
    };

    comments.forEach(comment => {
      const ipInfo = ipLocationCache.get(comment.ip || "");
      const rawLocation = ipInfo?.location || "";
      commentMap.set(comment.coid, {
        ...comment,
        children: [],
        parent_name: null,
        location: formatLocation(rawLocation),
        isp: ipInfo?.isp || "",
      });
    });

    comments.forEach(comment => {
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          const childComment = commentMap.get(comment.coid);
          childComment.parent_name = parent.name;
          parent.children.push(childComment);
        } else {
          // Orphan reply (parent doesn't exist in this post's comments)
          // Treat as a root-level comment
          rootComments.push(commentMap.get(comment.coid));
        }
      } else {
        rootComments.push(commentMap.get(comment.coid));
      }
    });

    // 分页使用根评论数量
    const totalRootComments = rootComments.length;
    const totalPages = Math.ceil(totalRootComments / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedRootComments = rootComments.slice(startIndex, startIndex + pageSize);

    // 所有评论总数（包括子评论）用于显示
    const totalAllComments = comments.length;

    return {
      code: 200,
      message: "获取评论列表成功",
      data: paginatedRootComments,
      pagination: {
        page,
        pageSize,
        total: totalRootComments,
        totalAllComments,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      });
    }
    throw createError({
      statusCode: 500,
      message: "获取评论列表失败",
    });
  }
});
