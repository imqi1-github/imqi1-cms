import { prisma } from "#server/utils/prisma";

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

    const comments = await prisma.comment.findMany({
      where: {
        cid,
        status: 1,
      },
      orderBy: {
        create_time: "desc",
      },
    });

    const commentMap = new Map<number, any>();
    const rootComments: any[] = [];

    comments.forEach(comment => {
      commentMap.set(comment.coid, {
        ...comment,
        children: [],
        parent_name: null,
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

    const total = rootComments.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedRootComments = rootComments.slice(startIndex, startIndex + pageSize);

    return {
      code: 200,
      message: "获取评论列表成功",
      data: paginatedRootComments,
      pagination: {
        page,
        pageSize,
        total,
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
