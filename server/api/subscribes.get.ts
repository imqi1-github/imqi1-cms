import { getSubscribePosts } from '#server/utils/rss';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = query.limit ? parseInt(query.limit as string) : undefined;

    const posts = await getSubscribePosts();

    // 如果指定了limit，只返回前N条
    const limitedPosts = limit ? posts.slice(0, limit) : posts;

    return {
      success: true,
      data: limitedPosts,
    };
  } catch (error) {
    console.error('获取订阅文章失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取订阅文章失败',
    });
  }
});
