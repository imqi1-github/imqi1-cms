import { afterEach, describe, expect, test } from "bun:test";

import "./setup-globals";

import Storage from "~/lib/aplayer/storage";

afterEach(() => {
  // 清 localStorage 避免污染
  if (typeof localStorage !== "undefined") localStorage.clear();
});

function makePlayer(opts: { storageName: string; volume: number }) {
  return {
    options: {
      storageName: opts.storageName,
      volume: opts.volume,
    },
  };
}

describe("Storage 构造(数据损坏兜底)", () => {
  test("localStorage 无值 → 用 options.volume 初始化,data 为空对象", () => {
    const player = makePlayer({ storageName: "test-1", volume: 0.5 });
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.5);
    expect(s.data).toEqual({ volume: 0.5 });
  });

  test("localStorage 有合法 JSON → 解析并保留", () => {
    localStorage.setItem("test-2", JSON.stringify({ volume: 0.8, foo: "bar" }));
    const player = makePlayer({ storageName: "test-2", volume: 0.5 });
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.8);
    expect(s.get("foo")).toBe("bar");
  });

  test("localStorage 有损坏 JSON → 兜底 {},不抛", () => {
    localStorage.setItem("test-3", "{bad-json");
    const player = makePlayer({ storageName: "test-3", volume: 0.5 });
    expect(() => new Storage(player as never)).not.toThrow();
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.5); // 用 options.volume 兜底
  });

  test("localStorage 是 JSON 字符串 → 兜底成 {} (非对象)", () => {
    localStorage.setItem("test-4", JSON.stringify("just a string"));
    const player = makePlayer({ storageName: "test-4", volume: 0.3 });
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.3);
  });

  test("localStorage 是 JSON 数组 → 兜底成 {} (数组被拒)", () => {
    localStorage.setItem("test-5", JSON.stringify([1, 2, 3]));
    const player = makePlayer({ storageName: "test-5", volume: 0.2 });
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.2);
  });

  test("localStorage 是 null 字符串 → 兜底成 {}", () => {
    localStorage.setItem("test-6", "null");
    const player = makePlayer({ storageName: "test-6", volume: 0.1 });
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.1);
  });
});

describe("Storage.get / set", () => {
  test("set 写入 + get 读出", () => {
    const player = makePlayer({ storageName: "test-7", volume: 0.5 });
    const s = new Storage(player as never);
    s.set("foo", "bar");
    expect(s.get("foo")).toBe("bar");
    // 验证也写到了 localStorage
    expect(JSON.parse(localStorage.getItem("test-7")!)).toMatchObject({ foo: "bar", volume: 0.5 });
  });

  test("volume=0 必须保留(不是 fallback 到 options.volume)", () => {
    // memory 钉过:Storage.volume 用 ?? 勿 ||(0 被当 falsy 会回退)
    const player = makePlayer({ storageName: "test-8", volume: 0.5 });
    localStorage.setItem("test-8", JSON.stringify({ volume: 0 }));
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0); // 应保留 0,不是 0.5
  });

  test("构造后 set 会同步覆盖 localStorage", () => {
    const player = makePlayer({ storageName: "test-9", volume: 0.5 });
    const s = new Storage(player as never);
    s.set("volume", 0.9);
    const stored = JSON.parse(localStorage.getItem("test-9")!);
    expect(stored.volume).toBe(0.9);
  });

  test("data.volume 是非 number(字符串)→ 用 options.volume 兜底", () => {
    localStorage.setItem("test-10", JSON.stringify({ volume: "not-a-number" }));
    const player = makePlayer({ storageName: "test-10", volume: 0.7 });
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.7);
  });

  test("data 缺 volume → 用 options.volume 兜底", () => {
    localStorage.setItem("test-11", JSON.stringify({ otherKey: "x" }));
    const player = makePlayer({ storageName: "test-11", volume: 0.4 });
    const s = new Storage(player as never);
    expect(s.get("volume")).toBe(0.4);
  });
});