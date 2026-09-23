import { describe, expect, test } from "bun:test";

import { escapeAttribute, escapeHtml, escapeRegExp, sanitizeHtml } from "../../shared/html";

// 用 chr(N) 拼特殊字符,避免源码里的 < > " 被工具链二次解释
function chr(n: number): string {
  return String.fromCharCode(n);
}

describe("escapeHtml", () => {
  test("转义全部 5 个 HTML 特殊字符", () => {
    // 输入: <script>alert("xss'")&</script>
    const input =
      chr(60) + "script" + chr(62) + "alert(" + chr(34) + "xss" + chr(39) + chr(34) + ")" +
      chr(38) + chr(60) + "/script" + chr(62);
    const AMP = chr(38);
    const ltEntity = AMP + "lt;";
    const gtEntity = AMP + "gt;";
    const quotEntity = AMP + "quot;";
    const aposEntity = AMP + "#39;";
    const ampEntity = AMP + "amp;";
    const expected =
      ltEntity + "script" + gtEntity + "alert(" + quotEntity + "xss" + aposEntity +
      quotEntity + ")" + ampEntity + ltEntity + "/script" + gtEntity;
    expect(escapeHtml(input)).toBe(expected);
  });

  test("空字符串原样返回", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("无任何特殊字符时原样返回", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
    expect(escapeHtml("123 abc 中文")).toBe("123 abc 中文");
  });

  test("& 必须最先替换,否则双重转义", () => {
    // 验证替换后的 & 不会再被其它规则命中 → 结果里不应有 amp;amp;
    const r = escapeHtml(chr(38) + chr(60));
    const expected = chr(38) + "amp;" + chr(38) + "lt;";
    expect(r).toBe(expected);
    expect(r).not.toContain("amp;amp;");
  });
});

describe("escapeAttribute", () => {
  test("行为等价 escapeHtml", () => {
    const input = chr(60) + "img src=x onerror=alert(1)" + chr(62);
    expect(escapeAttribute(input)).toBe(escapeHtml(input));
  });
});

describe("sanitizeHtml", () => {
  test("整个 <script> 块(含内部文本)被剥离", () => {
    // DOMPurify 对 <script> 是整体删除,不会保留内文
    expect(sanitizeHtml("hello<script>alert(1)</script>")).toBe("hello");
  });

  test("保留安全标签与白名单属性 (target/rel/loading/class/style)", () => {
    const html =
      '<a href="/x" target="_blank" rel="noopener" class="link" style="color:red" loading="lazy">ok</a>';
    const r = sanitizeHtml(html);
    expect(r).toContain("href=\"/x\"");
    expect(r).toContain("target=\"_blank\"");
    expect(r).toContain("rel=\"noopener\"");
    expect(r).toContain("class=\"link\"");
    expect(r).toContain("loading=\"lazy\"");
    expect(r).toContain("ok");
  });

  test("允许 mark 标签(扩展白名单)", () => {
    expect(sanitizeHtml("foo<mark>bar</mark>baz")).toBe("foo<mark>bar</mark>baz");
  });

  test("data-summary / data-url 等扩展 data-* 属性被保留(显式加进 ADD_ATTR)", () => {
    const html = "<p data-summary=\"abc\" data-url=\"/x\">hello</p>";
    const r = sanitizeHtml(html);
    expect(r).toContain("data-summary=\"abc\"");
    expect(r).toContain("data-url=\"/x\"");
  });

  test("剥离事件处理器 onerror / onclick", () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain("onerror");
    expect(sanitizeHtml('<a href="/x" onclick="evil()">go</a>')).not.toContain("onclick");
  });
});

describe("escapeRegExp", () => {
  test("转义全部正则元字符", () => {
    // . * + ? ^ $ { } ( ) | [ ] \ 全部加上 \
    expect(escapeRegExp(".*+?^${}()|[]\\")).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  test("普通文本不改变", () => {
    expect(escapeRegExp("abc")).toBe("abc");
  });

  test("转义后能在 RegExp 里安全重建,匹配原字面量", () => {
    const literal = "user.name+tag@example.com";
    const re = new RegExp(escapeRegExp(literal));
    expect(re.test(literal)).toBe(true);
    // 没转义的话 . 会匹配任意字符,+ 会被当量词
    expect("userXnameXtag@example.com".match(new RegExp(escapeRegExp(literal)))).toBeNull();
  });
});
