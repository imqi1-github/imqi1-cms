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
  setResponseHeaders,
} from "h3";

import { commentAvatarUrl, getCommentAvatarService } from "#server/utils/comment-avatar";

const g = globalThis as unknown as Record<string, unknown>;
g.createError ??= createError;
g.getHeader ??= getHeader;
g.setHeader ??= setHeader;
g.setResponseHeader ??= setResponseHeader;
g.setResponseStatus ??= setResponseStatus;
g.setResponseHeaders ??= setResponseHeaders;
g.readBody ??= readBody;
g.defineEventHandler ??= defineEventHandler;
g.getRouterParam ??= getRouterParam;
g.getQuery ??= getQuery;
g.sendStream ??= sendStream;
// defineNitroPlugin 只是标记函数,bun 下用恒等替身
g.defineNitroPlugin ??= (fn: (nitroApp?: unknown) => unknown) => fn;
// server/utils 层的自动导入:直接用真实实现
g.getCommentAvatarService ??= getCommentAvatarService;
g.commentAvatarUrl ??= commentAvatarUrl;
// runtimeConfig 桩:redis 默认关(测试不连 Redis),需要具体键的测试自行覆盖赋值
g.useRuntimeConfig ??= () => ({ redis: null, buildHash: "" });
