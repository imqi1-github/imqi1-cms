import { describe, expect, test } from "bun:test";

import { useFrontNotification } from "~/composables/useFrontNotification";

describe("useFrontNotification", () => {
  test("返回 success / error / info 三个便捷方法 + notify 通用方法", () => {
    const fn = useFrontNotification();
    expect(typeof fn.success).toBe("function");
    expect(typeof fn.error).toBe("function");
    expect(typeof fn.info).toBe("function");
    expect(typeof fn.notify).toBe("function");
  });

  test("notify/success/error/info 是独立函数引用(不共享闭包导致 type 默认值串)", () => {
    const fn = useFrontNotification();
    expect(fn.success).not.toBe(fn.error);
    expect(fn.error).not.toBe(fn.info);
  });

  test("client 守卫:broadcastEvent 不抛(import.meta.client=false 时早 return)", () => {
    const fn = useFrontNotification();
    // 客户端分支因 import.meta.client=false 不派发事件,不抛
    expect(() => fn.success("已保存")).not.toThrow();
    expect(() => fn.error("网络错误")).not.toThrow();
    expect(() => fn.info("提示")).not.toThrow();
    expect(() => fn.notify("自定义")).not.toThrow();
  });
});