import { getSubscribePosts } from '#server/utils/rss';

export default defineEventHandler(async event => {
  try {
    const posts = await getSubscribePosts();
    return {
      success: true,
      data: posts,
    };
  } catch (error) {
    console.error('获取订阅文章失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取订阅文章失败',
    });
  }
});
