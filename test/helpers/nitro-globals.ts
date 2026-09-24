// Nitro 自动导入的符号在 bun test 里不存在,用 h3 的同名实现挂到 globalThis
// 被测模块须在挂载之后导入(测试文件把本 helper 放第一个 import)
import {
  createError,
  defineEventHandler,
  getHeader,
  getQuery,
  getRouterParam,
  readBody,
  sendStream,
  setHeader,
  setResponseHeader,
  setResponseStatus,
} from "h3";

const g = globalThis as unknown as Record<string, unknown>;
g.createError ??= createError;
g.getHeader ??= getHeader;
g.setHeader ??= setHeader;
g.setResponseHeader ??= setResponseHeader;
g.setResponseStatus ??= setResponseStatus;
g.readBody ??= readBody;
g.defineEventHandler ??= defineEventHandler;
g.getRouterParam ??= getRouterParam;
g.getQuery ??= getQuery;
g.sendStream ??= sendStream;
// defineNitroPlugin 只是标记函数,bun 下用恒等替身
g.defineNitroPlugin ??= (fn: (nitroApp?: unknown) => unknown) => fn;
