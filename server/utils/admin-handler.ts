import {
  createError,
  defineEventHandler,
  getRequestHeader,
  readBody,
  type EventHandlerRequest,
  type H3Event,
} from "h3";

import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";

type AdminUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export interface AdminHandlerOptions {
  /** 是否校验 CSRF（默认 true；只读接口传 false） */
  csrf?: boolean;
}

/**
 * admin 接口统一守卫：登录校验(401) + CSRF(403) 前置。
 *
 * - handler 收到 (event, user)：user 已登录，可直接使用；返回值透传。
 * - CSRF token 来源兼容 POST/PUT/PATCH( body.csrfToken ) 与 DELETE( header x-csrf-token )。
 * - 只读接口（如 *.get.ts）传 { csrf: false }，仅做登录校验。
 *
 * body 只在此处读取一次用于提取 csrfToken；h3 的 readBody 会缓存解析结果，
 * handler 内再 readBody 拿到的是同一份（幂等）。handler 自身的 try/catch 保留，
 * 以保住各自的错误文案。
 */
export function defineAdminEventHandler<T>(
  handler: (event: H3Event<EventHandlerRequest>, user: AdminUser) => T | Promise<T>,
  opts: AdminHandlerOptions = {},
) {
  const csrf = opts.csrf ?? true;
  return defineEventHandler(async event => {
    // 登录校验
    const user = await getUser(event);
    if (!user) throw createError({ statusCode: 401, message: "请先登录" });

    // CSRF 校验
    if (csrf) {
      const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
      const csrfToken = (body?.csrfToken as string | undefined) ?? getRequestHeader(event, "x-csrf-token");
      if (!validateCsrfToken(event, csrfToken)) {
        throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
      }
    }

    return handler(event, user);
  });
}
