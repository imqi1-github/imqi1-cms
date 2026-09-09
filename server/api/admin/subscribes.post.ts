import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateSubscribeData } from "#server/utils/validation";
import { validateCsrfToken } from "#server/utils/csrf";
import { invalidateContentCaches } from "#server/utils/content-cache";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { csrfToken } = body;

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  // 必填 + 类型校验：validateSubscribeData 只校验存在时的长度，缺 name/url 或传非字符串会放行到 Prisma 报必填错→500
  if (typeof body.name !== 'string' || !body.name.trim() || typeof body.url !== 'string' || !body.url.trim()) {
    throw createError({ statusCode: 400, message: "名称和链接为必填项" });
  }

  try {
    // 验证字段长度
    validateSubscribeData({
      name: body.name,
      url: body.url,
      avatar: body.avatar,
    });

    const subscribe = await prisma.subscribes.create({
      data: {
        name: body.name,
        url: body.url,
        avatar: typeof body.avatar === 'string' ? body.avatar : null,
      },
      // 约定1 白名单：不裸返回整行
      select: { id: true, url: true, name: true, avatar: true, lastUpdated: true },
    });
    // 订阅变更 → 立即失效订阅页 / 首页(订阅文章) / 地图页(博客网络) ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/subscribes", "/map"] }).catch(err => console.error("[cache] 订阅创建失效缓存失败", err));
    return subscribe;
  } catch (error) {
    // 已带 statusCode 的错误（如 validateSubscribeData 的 400）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "创建订阅失败",
    });
  }
});
