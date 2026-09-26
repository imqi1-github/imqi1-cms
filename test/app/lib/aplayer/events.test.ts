import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import Events from "~/lib/aplayer/events";

let origErr: typeof console.error;
let errLogs: unknown[][] = [];

beforeEach(() => {
  errLogs = [];
  origErr = console.error;
  console.error = (...args: unknown[]) => {
    errLogs.push(args);
  };
});

afterEach(() => {
  console.error = origErr;
});

describe("Events.type", () => {
  test("audio 事件名 → 'audio'", () => {
    const e = new Events();
    expect(e.type("play")).toBe("audio");
    expect(e.type("pause")).toBe("audio");
    expect(e.type("ended")).toBe("audio");
  });

  test("player 事件名 → 'player'", () => {
    const e = new Events();
    expect(e.type("destroy")).toBe("player");
    expect(e.type("listshow")).toBe("player");
    expect(e.type("lrcshow")).toBe("player");
  });

  test("未知事件名 → null + console.error", () => {
    const e = new Events();
    expect(e.type("unknown-event")).toBeNull();
    expect(errLogs.length).toBeGreaterThanOrEqual(1);
    expect(String(errLogs[0]?.[0])).toMatch(/Unknown event name/);
  });
});

describe("Events.on / trigger", () => {
  test("on 注册 + trigger 调用 handler", () => {
    const e = new Events();
    const calls: unknown[] = [];
    e.on("play", (data) => calls.push(data));
    e.trigger("play", { id: 1 });
    expect(calls).toEqual([{ id: 1 }]);
  });

  test("同一个事件可注册多个 handler,全部触发", () => {
    const e = new Events();
    const a: number[] = [];
    const b: number[] = [];
    e.on("pause", () => a.push(1));
    e.on("pause", () => b.push(2));
    e.trigger("pause");
    expect(a).toEqual([1]);
    expect(b).toEqual([2]);
  });

  test("未知事件名 on → 静默忽略(handler 不被注册)", () => {
    const e = new Events();
    let called = false;
    e.on("bogus", () => { called = true; });
    // type('bogus') 返回 null,on 应跳过
    // 不抛 + 后续 trigger bogus 也不会执行
    e.trigger("bogus");
    expect(called).toBe(false);
  });

  test("trigger 时 handler 列表为空 → 不抛", () => {
    const e = new Events();
    expect(() => e.trigger("play")).not.toThrow();
  });

  test("trigger 时 handler 列表快照迭代(回调内 on 不影响本轮)", () => {
    // 快照拷贝:防止回调内 on() 追加导致本轮无限循环
    const e = new Events();
    const calls: number[] = [];
    e.on("play", () => {
      calls.push(1);
      // 试图在本轮 trigger 中再 on 一个 handler,本轮不应被触发
      e.on("play", () => calls.push(99));
    });
    e.trigger("play");
    expect(calls).toEqual([1]);
    // 但下一轮 trigger 会看到新加的 handler
    e.trigger("play");
    expect(calls).toEqual([1, 1, 99]);
  });

  test("非函数 callback → 静默忽略", () => {
    const e = new Events();
    // @ts-expect-error 故意传非函数验证静默忽略
    e.on("play", "not a function");
    expect(() => e.trigger("play")).not.toThrow();
  });
});

describe("Events 默认事件清单", () => {
  test("audioEvents 包含标准 HTMLMediaElement 事件", () => {
    const e = new Events();
    expect(e.audioEvents).toContain("play");
    expect(e.audioEvents).toContain("pause");
    expect(e.audioEvents).toContain("ended");
    expect(e.audioEvents).toContain("timeupdate");
    expect(e.audioEvents).toContain("error");
    expect(e.audioEvents.length).toBeGreaterThanOrEqual(20);
  });

  test("playerEvents 包含 lrcshow / lrchide / listshow 等", () => {
    const e = new Events();
    expect(e.playerEvents).toContain("lrcshow");
    expect(e.playerEvents).toContain("lrchide");
    expect(e.playerEvents).toContain("listshow");
    expect(e.playerEvents).toContain("destroy");
  });
});