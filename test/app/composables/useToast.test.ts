import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("vue-sonner", () => {
  const calls: Array<{ kind: string; msg: string; opts: { description?: string; duration?: number } }> = [];
  return {
    toast: Object.assign(
      (msg: string, opts: { description?: string; duration?: number }) => {
        calls.push({ kind: "custom", msg, opts });
        return "id";
      },
      {
        success: (msg: string, opts: { description?: string; duration?: number }) => {
          calls.push({ kind: "success", msg, opts });
          return "id";
        },
        error: (msg: string, opts: { description?: string; duration?: number }) => {
          calls.push({ kind: "error", msg, opts });
          return "id";
        },
        info: (msg: string, opts: { description?: string; duration?: number }) => {
          calls.push({ kind: "info", msg, opts });
          return "id";
        },
        warning: (msg: string, opts: { description?: string; duration?: number }) => {
          calls.push({ kind: "warning", msg, opts });
          return "id";
        },
        promise: <T,>(promise: Promise<T>, opts: { loading: string; success: unknown; error: unknown }) => {
          calls.push({ kind: "promise", msg: opts.loading, opts: opts as unknown as { description?: string; duration?: number } });
          promise.catch(() => {});
          return promise;
        },
      },
    ),
    __calls: calls,
  };
});

const sonner = await import("vue-sonner");
const { useToast } = await import("../../../app/composables/useToast");
const calls = (sonner as unknown as { __calls: Array<{ kind: string; msg: string; opts: { description?: string; duration?: number } }> }).__calls;

beforeEach(() => calls.length = 0);

describe("useToast", () => {
  test("success / error / info / warning 四种调用透传 message + duration=4000", () => {
    const t = useToast();
    t.success({ message: "ok" });
    t.error({ message: "bad" });
    t.info({ message: "i" });
    t.warning({ message: "w" });
    expect(calls).toHaveLength(4);
    expect(calls.map(c => c.kind)).toEqual(["success", "error", "info", "warning"]);
    expect(calls.every(c => c.opts.duration === 4000)).toBe(true);
  });

  test("自定义 duration 覆盖默认 4000", () => {
    const t = useToast();
    t.success({ message: "ok", duration: 1000 });
    expect(calls[0]!.opts.duration).toBe(1000);
  });

  test("error.data.message 优先于 description 且被截断到 80 字符内", () => {
    const t = useToast();
    const long = "x".repeat(200);
    t.error({ message: "m", description: "should-be-replaced", error: { data: { message: long } } });
    expect(calls[0]!.opts.description!.length).toBeLessThanOrEqual(80);
    expect(calls[0]!.opts.description!.endsWith("…")).toBe(true);
  });

  test("error 没有 message 时回落到 description;都不存在则空串", () => {
    const t = useToast();
    t.error({ message: "m", description: "fallback", error: {} });
    expect(calls[0]!.opts.description).toBe("fallback");
    t.error({ message: "m", description: "fb", error: { data: {} } });
    expect(calls[1]!.opts.description).toBe("fb");
    t.error({ message: "m", error: { data: { message: 123 } } });
    expect(calls[2]!.opts.description).toBe("");
  });

  test("不传 error 时 description 原样透传,不被截断", () => {
    const t = useToast();
    const long = "z".repeat(200);
    t.success({ message: "m", description: long });
    expect(calls[0]!.opts.description).toBe(long);
  });

  test("error 是非对象(null/字符串/数字)时不抽 message,回落到 description", () => {
    const t = useToast();
    t.error({ message: "m", description: "fb", error: null });
    expect(calls[0]!.opts.description).toBe("fb");
    t.error({ message: "m", description: "fb", error: "raw" });
    expect(calls[1]!.opts.description).toBe("fb");
  });

  test("promise 包装透传 loading/success/error 文本", async () => {
    const t = useToast();
    await t.promise(Promise.resolve(1), { loading: "loading…", success: "ok", error: "fail" });
    expect(calls[0]!.kind).toBe("promise");
    expect(calls[0]!.msg).toBe("loading…");
  });
});