import { getSubscribePosts } from '#server/utils/rss';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = query.limit ? parseInt(query.limit as string) : undefined;

    // 设置缓存头：CDN和浏览器缓存5分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    const contents = await getSubscribePosts();

    // 如果指定了limit，只返回前N条
    const limitedContents = limit ? contents.slice(0, limit) : contents;

    return {
      success: true,
      data: limitedContents,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: '获取订阅文章失败',
    });
  }
});
