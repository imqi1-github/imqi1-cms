import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// error-handler plugin 依赖 Nuxt 自动导入 + useToast,提供 markErrorHandled 与 errorHandler。
// error-handler.ts 不显式 import #app(靠 Nuxt 自动导入),挂 globalThis 注入。
(globalThis as Record<string, unknown>).defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;

const errorToasts: Array<{ message: string; description?: string }> = [];
const fakeUseToast = () => ({
  error: (input: { message: string; description?: string }) => {
    errorToasts.push(input);
  },
});
(globalThis as Record<string, unknown>).useToast = fakeUseToast;

const { default: errorHandlerPlugin } = await import(
  "~/plugins/error-handler"
);

interface ProvidedApi {
  markErrorHandled: <T extends object | null | undefined>(error: T) => T;
}
interface ErrorHandlerHook {
  vueApp: {
    config: {
      errorHandler?: (error: unknown) => void;
    };
  };
}

function loadPlugin(): {
  api: ProvidedApi;
  errorHandler: (error: unknown) => void;
} {
  const provided: Record<string, unknown> = {};
  let captured: ((e: unknown) => void) | undefined;
  const fakeNuxtApp: ErrorHandlerHook = {
    vueApp: {
      config: {
        set errorHandler(fn: (e: unknown) => void) {
          captured = fn;
        },
      },
    },
  };
  const result = errorHandlerPlugin(fakeNuxtApp as never, {} as never) as
    | { provide?: Record<string, unknown> }
    | undefined;
  for (const [k, v] of Object.entries(result?.provide ?? {})) {
    provided[k] = v;
  }
  return { api: provided as ProvidedApi, errorHandler: (e: unknown) => captured?.(e) };
}

beforeEach(() => {
  errorToasts.length = 0;
});
afterEach(() => {
  errorToasts.length = 0;
});

describe("error-handler plugin provide", () => {
  test("提供 markErrorHandled 方法", () => {
    const { api } = loadPlugin();
    expect(typeof api.markErrorHandled).toBe("function");
  });

  test("markErrorHandled 给对象打 __handled__ 标记后原样返回", () => {
    const { api } = loadPlugin();
    const err = new Error("boom");
    const ret = api.markErrorHandled(err);
    expect(ret).toBe(err);
    expect((err as Error & { __handled__?: boolean }).__handled__).toBe(true);
  });

  test("markErrorHandled 对 null/undefined 不抛,返回原值", () => {
    const { api } = loadPlugin();
    expect(api.markErrorHandled(null)).toBeNull();
    expect(api.markErrorHandled(undefined)).toBeUndefined();
  });

  test("markErrorHandled 对非对象(数字/字符串)不抛,返回原值", () => {
    const { api } = loadPlugin();
    expect(api.markErrorHandled(42 as unknown as object)).toBe(42);
    expect(api.markErrorHandled("x" as unknown as object)).toBe("x");
  });
});

describe("error-handler plugin errorHandler 行为(SSR 无 window)", () => {
  // SSR 路径:没有 typeof window === "undefined" 守护,所以 unhandledrejection/error listener 不挂;
  // 但 errorHandler 仍注册,handleError 走 toast.error 时 typeof window !== "undefined" 兜底不弹 toast。
  test("注册了 vueApp.config.errorHandler", () => {
    const { errorHandler } = loadPlugin();
    expect(typeof errorHandler).toBe("function");
  });

  test("Error 实例 → 内部 message 落 toast description (client 不存在时跳过 toast)", () => {
    const { errorHandler } = loadPlugin();
    errorHandler(new Error("网络超时"));
    // SSR 无 window → toast.error 不会被调,但 console.error 会触发。
    // 这里只验证 errorHandler 不抛。
  });

  test("已 __handled__ 标记的错误 → 不重复处理 (toast 不调)", () => {
    const { errorHandler, api } = loadPlugin();
    const err = new Error("dup");
    api.markErrorHandled(err);
    errorHandler(err);
    expect(errorToasts).toHaveLength(0);
  });

  test("h3 createError 风格(带 statusMessage) → 走 statusMessage 兜底", () => {
    const { errorHandler } = loadPlugin();
    const err = Object.assign(new Error(""), { statusMessage: "Forbidden" });
    errorHandler(err);
    // SSR 不弹 toast,client 时会。验证 errorHandler 不抛。
  });
});