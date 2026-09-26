import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import "./setup-globals";

import utils, { escapeHtml } from "~/lib/aplayer/utils";

describe("escapeHtml(防 DOM XSS)", () => {
  test("转义全部 5 个 HTML 特殊字符", () => {
    // 输入: <script>alert("xss'")&</script>
    const input = "<script>alert(\"xss'\")&</script>";
    expect(escapeHtml(input)).toBe(
      "&lt;script&gt;alert(&quot;xss&#39;&quot;)&amp;&lt;/script&gt;",
    );
  });

  test("& 必须最先替换,否则双重转义", () => {
    // "<&" → step1 "&"→"&amp;" → step2 "<"→"&lt;" → 结果 "&lt;&amp;"
    // 验证:不出现双重转义 "&amp;amp;"(说明 & 的替换早于其他)
    expect(escapeHtml("<&")).toBe("&lt;&amp;");
    expect(escapeHtml("<&")).not.toContain("&amp;amp;");
  });

  test("null/undefined → 空串", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  test("数字 / 布尔 → 转字符串", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(true)).toBe("true");
    expect(escapeHtml(false)).toBe("false");
  });

  test("普通文本/中文原样", () => {
    expect(escapeHtml("hello")).toBe("hello");
    expect(escapeHtml("你好,世界")).toBe("你好,世界");
  });

  test("属性插值场景:含双引号的歌曲名转义后闭合 <img src=\"...\">", () => {
    const name = `evil" onerror="alert(1)`;
    const safe = escapeHtml(name);
    expect(safe).not.toContain('"');
    expect(safe).toBe("evil&quot; onerror=&quot;alert(1)");
  });
});

describe("secondToTime", () => {
  test("< 1 小时 → mm:ss", () => {
    expect(utils.secondToTime(0)).toBe("00:00");
    expect(utils.secondToTime(59)).toBe("00:59");
    expect(utils.secondToTime(60)).toBe("01:00");
    expect(utils.secondToTime(125)).toBe("02:05");
  });

  test("≥ 1 小时 → hh:mm:ss", () => {
    expect(utils.secondToTime(3600)).toBe("01:00:00");
    expect(utils.secondToTime(3661)).toBe("01:01:01");
    expect(utils.secondToTime(7325)).toBe("02:02:05");
  });

  test("小数秒 → floor 整数(秒级精度)", () => {
    expect(utils.secondToTime(59.9)).toBe("00:59");
    expect(utils.secondToTime(60.5)).toBe("01:00");
  });

  test("负数 → 仍格式化(虽无业务场景,防御性)", () => {
    // floor(-1/3600)=0, min=floor((-1-0)/60)=-1, sec=floor(-1-0-(-1)*60)=0... 实际行为未承诺
    // 这里只断言函数不抛
    expect(() => utils.secondToTime(-1)).not.toThrow();
  });
});

describe("randomOrder(Fisher-Yates 洗牌)", () => {
  test("返回 length 长度 0..length-1 全集", () => {
    const out = utils.randomOrder(10);
    expect(out).toHaveLength(10);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("length=0 → 空数组", () => {
    expect(utils.randomOrder(0)).toEqual([]);
  });

  test("length=1 → [0]", () => {
    expect(utils.randomOrder(1)).toEqual([0]);
  });

  test("多次洗牌通常顺序不同(统计 10 次至少 1 次乱序)", () => {
    const same = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let anyDifferent = false;
    for (let i = 0; i < 10; i++) {
      const out = utils.randomOrder(10);
      if (out.some((v, idx) => v !== same[idx])) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});

describe("storage(localStorage 兜底)", () => {
  // utils.storage 在浏览器/Node 下都走 localStorage;happy-dom 提供
  let savedStorage: unknown;

  beforeEach(() => {
    savedStorage = (globalThis as Record<string, unknown>).localStorage;
  });

  afterEach(() => {
    if (savedStorage !== undefined) {
      (globalThis as Record<string, unknown>).localStorage = savedStorage;
    }
  });

  test("set + get 往返", () => {
    utils.storage.set("k", "v");
    expect(utils.storage.get("k")).toBe("v");
  });

  test("get 不存在的 key → null", () => {
    expect(utils.storage.get("never-set")).toBeNull();
  });

  test("localStorage.setItem 抛错(隐私模式/满容)→ set 静默吞,不抛", () => {
    const throwingStorage = {
      setItem: () => { throw new Error("quota"); },
      getItem: () => null,
    };
    (globalThis as Record<string, unknown>).localStorage = throwingStorage;
    expect(() => utils.storage.set("k", "v")).not.toThrow();
  });

  test("localStorage.getItem 抛错 → get 返回 null", () => {
    const throwingStorage = {
      setItem: () => {},
      getItem: () => { throw new Error("access denied"); },
    };
    (globalThis as Record<string, unknown>).localStorage = throwingStorage;
    expect(utils.storage.get("k")).toBeNull();
  });
});

describe("nameMap(触摸/鼠标事件映射)", () => {
  test("nameMap 字段存在且类型为字符串", () => {
    expect(typeof utils.nameMap.dragStart).toBe("string");
    expect(typeof utils.nameMap.dragMove).toBe("string");
    expect(typeof utils.nameMap.dragEnd).toBe("string");
  });
});