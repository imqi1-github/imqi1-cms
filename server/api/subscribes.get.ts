import { getSubscribePosts } from '#server/utils/rss';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);

    // limit 钳到 [1, 30]：getSubscribePosts 最多返回 30 篇，负数/小数/超大传入 slice 无意义；
    // query 对重复参数（?limit=a&limit=b）会返回数组，仅 as string 会让数组流入 slice 抛错，先 typeof 收窄，非字符串直接 400
    const limitRaw = query.limit;
    let limit: number | undefined;
    if (limitRaw !== undefined && limitRaw !== '') {
      if (typeof limitRaw !== 'string') {
        throw createError({ statusCode: 400, message: 'limit 参数格式不正确' });
      }
      limit = Math.min(30, Math.max(1, Math.floor(Number(limitRaw) || 30)));
    }

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
    // 已带 statusCode 的错误（如 limit 参数 400）原样抛，避免被 500 覆盖
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: '获取订阅文章失败',
    });
  }
});
