import {prisma} from "#server/utils/prisma";
import {getUser} from "#server/lib/auth";
import {validateLinkData} from "#server/utils/validation";
import {validateCsrfToken} from "#server/utils/csrf";
import {ensureUrlProtocol} from "#server/utils/urlGuard";
import {invalidateContentCaches} from "#server/utils/content-cache";

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
  const {csrfToken} = body;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 必填校验：validateLinkData 只校验存在时的长度，缺 name/link 会一路放行到 Prisma 报必填错→500
  if (typeof body.name !== 'string' || !body.name.trim() || typeof body.link !== 'string' || !body.link.trim()) {
    throw createError({
      statusCode: 400,
      message: '名称和链接为必填项',
    });
  }

  // 拦截 javascript:/data: 等非 http(s) 协议 → 存储型 XSS 后门（与公开接口 /api/links 一致）
  const rawLink = body.link.trim();
  if (!/^https?:\/\//i.test(rawLink) && /^[a-z][a-z0-9+.-]*:/i.test(rawLink)) {
    throw createError({
      statusCode: 400,
      message: "仅支持 http/https 链接",
    });
  }
  const link = /^https?:\/\//i.test(rawLink) ? rawLink : ensureUrlProtocol(rawLink);

  try {
    // 验证字段长度
    validateLinkData({
      name: body.name,
      link,
      desc: body.desc,
      avatar: body.avatar,
    });

    const created = await prisma.links.create({
      data: {
        name: body.name,
        link,
        desc: typeof body.desc === 'string' ? body.desc : null,
        avatar: typeof body.avatar === 'string' ? body.avatar : null,
      },
      // 约定1 白名单：不裸返回整行（含内部审核字段）
      select: {
        id: true,
        name: true,
        link: true,
        desc: true,
        avatar: true,
        enabled: true,
      },
    });
    // 友链变更 → 立即失效相关 ISR 页面缓存（best-effort，不阻塞也失败不影响写结果）
    void invalidateContentCaches({ routes: ["/links", "/map"] }).catch(err => console.error("[cache] 友链创建失效缓存失败", err));
    return created;
  } catch (error) {
    // 已带 statusCode 的错误（如 validateLinkData 的 400）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "创建链接失败",
    });
  }
});
