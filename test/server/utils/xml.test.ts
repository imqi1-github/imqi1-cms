import { describe, expect, test } from "bun:test";

import { escapeXml } from "../../../server/utils/xml";

// 实体字符经工具传输会被二次解码,用 chr(N) 拼特殊字符(同 shared/html.test.ts 的做法)
function chr(n: number): string {
  return String.fromCharCode(n);
}

describe("escapeXml", () => {
  test("转义全部 5 个 XML 特殊字符", () => {
    const AMP = chr(38);
    const input = [chr(38), chr(60), chr(62), chr(34), chr(39)].join("");
    const expected =
      AMP + "amp;" + AMP + "lt;" + AMP + "gt;" + AMP + "quot;" + AMP + "apos;";
    expect(escapeXml(input)).toBe(expected);
  });

  test("普通文本与中文原样返回", () => {
    expect(escapeXml("hello 世界 123")).toBe("hello 世界 123");
  });

  test("空字符串原样返回", () => {
    expect(escapeXml("")).toBe("");
  });

  test("& 最先替换,不产生二次编码", () => {
    const r = escapeXml(chr(38) + chr(60));
    expect(r).toBe(chr(38) + "amp;" + chr(38) + "lt;");
    expect(r).not.toContain("amp;amp;");
  });
});
