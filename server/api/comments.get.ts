import { prisma } from "#server/utils/prisma";
import { getIpLocation } from "#server/utils/qqwry";
import { parseUserAgent } from "#server/utils/parseUserAgent";
import type { CommentNode } from "#server/types/apis/comment-node";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);

    // 数值参数统一取正整型：cid 必须为正整数；page/pageSize 对负数/NaN/Infinity 回退默认。
    // pageSize 上限 10000 与前台「加载全部评论」实际传值对齐（CommentList loadAllComments），
    // 不收紧到 50 以免破坏该功能；pageSize 只做内存切片，不进入 Prisma skip/take，无 DB 滥用面。
    const cid = Number(query.cid);
    const page = Number.isFinite(Number(query.page))
      ? Math.max(1, Math.floor(Number(query.page)))
      : 1;
    const pageSize = Number.isFinite(Number(query.pageSize))
      ? Math.min(10000, Math.max(1, Math.floor(Number(query.pageSize))))
      : 10;

    if (!Number.isInteger(cid) || cid <= 0) {
      throw createError({
        statusCode: 400,
        message: "缺少文章ID参数",
      });
    }

    // 头像服务与主站后台共用一份设置（commentAvatarService），默认 gravatar。
    // 走共享 util，保证评论区与最近评论等所有展示位使用同一头像源。
    const avatarService = await getCommentAvatarService();

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

    const commentMap = new Map<number, CommentNode>();
    const rootComments: CommentNode[] = [];

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
      const loc = location.replace(/^中国[–—-]?/, "");
      if (!loc.trim() && location.startsWith("中国")) return "中国";

      // 按"–"或"—"或"-"分割
      const parts = loc.split(/[–—-]/).map(p => p.trim()).filter(p => p);

      if (parts.length === 0) return "";

      // 优先返回城市（第2部分），没有城市则返回省份（第1部分）
      // parts[0] 通常是省份，parts[1] 通常是城市，parts[2] 是区县
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
    };

    comments.forEach(comment => {
      const ipInfo = ipLocationCache.get(comment.ip || "");
      const rawLocation = ipInfo?.location || "";
      commentMap.set(comment.coid, {
        coid: comment.coid,
        cid: comment.cid,
        name: comment.name,
        link: comment.link,
        content: comment.content,
        create_time: comment.create_time,
        status: comment.status,
        parent_id: comment.parent_id,
        // 隐私字段（mail/ip/原始 agent）不下发：头像服务端算好，agent 预解析
        avatar: commentAvatarUrl(comment.mail, avatarService),
        device: parseUserAgent(comment.agent || ""),
        children: [],
        parent_name: null,
        location: formatLocation(rawLocation),
        isp: ipInfo?.isp || "",
      });
    });

    comments.forEach(comment => {
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        const childComment = commentMap.get(comment.coid);
        if (!childComment) return;
        if (parent) {
          childComment.parent_name = parent.name;
          parent.children.push(childComment);
        } else {
          rootComments.push(childComment);
        }
      } else {
        const rootComment = commentMap.get(comment.coid);
        if (rootComment) rootComments.push(rootComment);
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
    // 预期 400/404 原样抛（含缺少文章 ID 的 400），不打印完整堆栈；不回传内部错误文案
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    if (error instanceof Error && 'code' in error && error.code === "P2025") {
      throw createError({
        statusCode: 404,
        message: "评论不存在",
      });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取评论列表失败",
    });
  }
});
