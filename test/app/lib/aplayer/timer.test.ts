import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import "./setup-globals";

import Timer from "~/lib/aplayer/timer";

let origSetInterval: typeof setInterval;
let origClearInterval: typeof clearInterval;
let clearCalls: number[] = [];
let fakeId = 0;

beforeEach(() => {
  clearCalls = [];
  fakeId = 0;
  origSetInterval = globalThis.setInterval;
  origClearInterval = globalThis.clearInterval;
  globalThis.setInterval = ((cb: () => void, _ms: number) => {
    const id = ++fakeId;
    cb();
    return id as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = ((id: number) => {
    clearCalls.push(id);
  }) as unknown as typeof clearInterval;
});

afterEach(() => {
  globalThis.setInterval = origSetInterval;
  globalThis.clearInterval = origClearInterval;
});

function makePlayer() {
  const container = document.createElement("div");
  return {
    audio: { currentTime: 0, paused: false },
    container,
  };
}

describe("Timer 构造", () => {
  test("构造时启动 loadingChecker(100ms 间隔)", () => {
    const t = new Timer(makePlayer() as never);
    // 构造内调 init → initloadingChecker → setInterval(每 100ms)
    expect(fakeId).toBeGreaterThanOrEqual(1);
    t.destroy();
  });
});

describe("Timer.enable / disable", () => {
  test("enable('loading') → enableloadingChecker=true(允许 setInterval 回调检查 buffering)", () => {
    const t = new Timer(makePlayer() as never);
    t.enable("loading");
    // 之后 setInterval 回调会真的检查;enableloadingChecker 标志位 = true
    expect((t as unknown as { enableloadingChecker: boolean }).enableloadingChecker).toBe(true);
    t.destroy();
  });

  test("disable('loading') → enableloadingChecker=false(setInterval 回调早返)", () => {
    const t = new Timer(makePlayer() as never);
    t.enable("loading");
    t.disable("loading");
    expect((t as unknown as { enableloadingChecker: boolean }).enableloadingChecker).toBe(false);
    t.destroy();
  });
});

describe("Timer.destroy(清理)", () => {
  test("destroy → clearInterval 被调,enable 标志复位", () => {
    const t = new Timer(makePlayer() as never);
    t.enable("loading");
    const intervalId = (t as unknown as { loadingChecker: number }).loadingChecker;
    t.destroy();
    expect(clearCalls).toContain(intervalId);
    expect((t as unknown as { enableloadingChecker: boolean }).enableloadingChecker).toBe(false);
  });

  test("重复 destroy 不抛(幂等)", () => {
    const t = new Timer(makePlayer() as never);
    t.destroy();
    expect(() => t.destroy()).not.toThrow();
  });
});