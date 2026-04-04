import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const cid = parseInt(query.cid as string);

    if (!cid) {
      throw createError({
        statusCode: 400,
        message: "缺少文章ID参数",
      });
    }

    // 获取所有已启用的评论
    const comments = await prisma.comment.findMany({
      where: {
        cid,
        status: 1
      },
      orderBy: {
        create_time: 'asc'
      }
    });

    // 构建评论树结构
    const commentMap = new Map<number, any>();
    const rootComments: any[] = [];

    // 先将所有评论放入map
    comments.forEach(comment => {
      commentMap.set(comment.coid, {
        ...comment,
        children: []
      });
    });

    // 构建父子关系
    comments.forEach(comment => {
      if (comment.parent_id) {
        // 子评论
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.children.push(commentMap.get(comment.coid));
        }
      } else {
        // 根评论
        rootComments.push(commentMap.get(comment.coid));
      }
    });

    return {
      code: 200,
      message: "获取评论列表成功",
      data: rootComments
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
