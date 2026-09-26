// server/utils 依赖 Nitro 自动导入的全局符号;测试把它们拖进 test 项目编译图时
// 这里按需补声明(实现替身在 test/helpers/nitro-globals.ts),类型真实来源是 h3
declare global {
  const createError: typeof import("h3").createError;
  const getHeader: typeof import("h3").getHeader;
  const setHeader: typeof import("h3").setHeader;
  const setResponseStatus: typeof import("h3").setResponseStatus;
  const setResponseHeaders: typeof import("h3").setResponseHeaders;
  const getRequestURL: typeof import("h3").getRequestURL;
  // 与 Nuxt 一致:默认泛型 any(过严的 unknown 会让 server 侧 $fetch 调用全报类型错)
  const $fetch: <T = unknown>(url: string, opts?: Record<string, unknown>) => Promise<T>;
  const readBody: typeof import("h3").readBody;
  const defineEventHandler: typeof import("h3").defineEventHandler;
  const getRouterParam: typeof import("h3").getRouterParam;
  const getQuery: typeof import("h3").getQuery;
  const setResponseHeader: typeof import("h3").setResponseHeader;
  const sendStream: typeof import("h3").sendStream;
  const sendRedirect: typeof import("h3").sendRedirect;
  const readFormData: typeof import("h3").readFormData;
  // nitroApp 最小形状:插件测试只捕获 hooks.hook 注册
  const defineNitroPlugin: (fn: (nitroApp: {
    hooks: {
      hook(name: string, fn: (response: { body: unknown }, ctx: { event: import("h3").H3Event }) => void): void;
    };
  }) => void) => (nitroApp?: unknown) => void;
  // redis.ts 等被测试 import 链拖进编译图时按需补的 runtimeConfig 最小形状
  // amapUseServerProxy:server/api/amap/config.ts 在服务端读的开关
  const useRuntimeConfig: () => { redis?: { host?: string; port?: number; db?: number }; buildHash?: string; amapUseServerProxy?: boolean };
  const getCommentAvatarService: typeof import("#server/utils/comment-avatar").getCommentAvatarService;
  const commentAvatarUrl: typeof import("#server/utils/comment-avatar").commentAvatarUrl;
}

export {};
