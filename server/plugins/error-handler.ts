/**
 * Nitro 错误处理钩子：拦截服务端未捕获异常与 API 抛出的 createError → log.monitor + 邮件通知。
 *
 * 设计：
 *   - 拦截 statusCode >= 500 的错误（4xx 是客户端问题，不打扰站主）
 *   - 异步上报不阻塞主响应（防止错误处理本身引入延迟）
 *   - 上报失败不影响原错误传播
 */
import { reportError } from "#server/utils/error-report";
import { getClientIp } from "#server/utils/client-ip";

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook("error", async (error, ctx) => {
    try {
      const statusCode
        = error && typeof error === "object" && "statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : 500;
      if (statusCode < 500) return;

      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : null;
      const event = (ctx as { event?: { path?: string; node?: { req?: { headers?: Record<string, unknown> } }; method?: string } } | undefined)?.event;
      const url = event?.path ?? null;
      const ua = (event?.node?.req?.headers?.["user-agent"] as string | undefined) ?? null;
      const ip = event ? getClientIp(event as unknown as Parameters<typeof getClientIp>[0]) : null;
      const method = event?.method;

      void reportError({
        source: "server",
        level: "error",
        message: message.slice(0, 500),
        stack,
        url,
        userAgent: ua,
        ip,
        context: {
          statusCode,
          ...(method ? { method } : {}),
        },
      }).catch(err => {
        console.error("[error-handler] 上报失败:", err);
      });
    } catch (err) {
      console.error("[error-handler] 钩子内异常:", err);
    }
  });
});