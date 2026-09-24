// server/utils 依赖 Nitro 自动导入的全局符号;测试把它们拖进 test 项目编译图时
// 这里按需补声明(实现替身在 test/helpers/nitro-globals.ts),类型真实来源是 h3
declare global {
  const createError: typeof import("h3").createError;
  const getHeader: typeof import("h3").getHeader;
  const setHeader: typeof import("h3").setHeader;
  const setResponseStatus: typeof import("h3").setResponseStatus;
  const readBody: typeof import("h3").readBody;
  const defineEventHandler: typeof import("h3").defineEventHandler;
  const getRouterParam: typeof import("h3").getRouterParam;
  const getQuery: typeof import("h3").getQuery;
  const setResponseHeader: typeof import("h3").setResponseHeader;
  const sendStream: typeof import("h3").sendStream;
}

export {};
