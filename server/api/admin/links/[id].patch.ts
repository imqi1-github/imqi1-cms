import {prisma} from "#server/utils/prisma";
import {getUser} from "#server/lib/auth";
import {validateLinkData} from "#server/utils/validation";
import {validateCsrfToken} from "#server/utils/csrf";
import {ensureUrlProtocol} from "#server/utils/urlGuard";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少链接 ID",
    });
  }
  const linkId = Number(id);
  if (!Number.isInteger(linkId) || linkId <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的链接 ID",
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

  // 拦截 javascript:/data: 等非 http(s) 协议（存储型 XSS 后门，与公开接口一致）
  let link = body.link;
  if (typeof link === 'string' && link.trim()) {
    const raw = link.trim();
    if (!/^https?:\/\//i.test(raw) && /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      throw createError({ statusCode: 400, message: "仅支持 http/https 链接" });
    }
    link = /^https?:\/\//i.test(raw) ? raw : ensureUrlProtocol(raw);
  }
  if (typeof body.enabled !== 'undefined' && typeof body.enabled !== 'boolean') {
    throw createError({ statusCode: 400, message: "enabled 必须为布尔值" });
  }
  // 读入字段做 typeof 收窄：非字符串流进 Prisma String 字段会触发校验错误 500（与 post.ts 处理 desc/avatar 一致）
  if (body.name !== undefined && body.name !== null && typeof body.name !== 'string') {
    throw createError({ statusCode: 400, message: "name 必须为字符串" });
  }
  if (body.link !== undefined && body.link !== null && typeof body.link !== 'string') {
    throw createError({ statusCode: 400, message: "link 必须为字符串" });
  }
  if (body.desc !== undefined && body.desc !== null && typeof body.desc !== 'string') {
    throw createError({ statusCode: 400, message: "desc 必须为字符串" });
  }
  if (body.avatar !== undefined && body.avatar !== null && typeof body.avatar !== 'string') {
    throw createError({ statusCode: 400, message: "avatar 必须为字符串" });
  }

  try {
    // 验证字段长度
    validateLinkData({
      name: body.name,
      link,
      desc: body.desc,
      avatar: body.avatar,
    });

    // 检查链接是否存在
    const existing = await prisma.links.findUnique({
      where: { id: linkId },
    });

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: "链接不存在",
      });
    }

    // 更新链接（select 白名单：不裸返回整行内部审核字段）
    return await prisma.links.update({
      where: {id: linkId},
      data: {
        name: body.name,
        link,
        desc: body.desc,
        avatar: body.avatar,
        enabled: body.enabled,
      },
      select: {
        id: true,
        name: true,
        link: true,
        desc: true,
        avatar: true,
        enabled: true,
      },
    });
  } catch (error) {
    // 已带 statusCode 的错误（如 validateLinkData 的 400、链接不存在的 404）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // findUnique 与 update 间的并发删除竞态 → P2025 → 404
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "链接不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新链接失败",
    });
  }
});
