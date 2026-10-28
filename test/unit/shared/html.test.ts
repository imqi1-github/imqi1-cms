import { describe, expect, test } from "bun:test";

import { decodeEntities, escapeAttribute, escapeHtml, escapeHtmlWithLinks, escapeRegExp, sanitizeHtml } from "#shared/html";

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

describe("decodeEntities", () => {
  test("解码常见命名实体", () => {
    const AMP = chr(38);
    expect(decodeEntities(`A ${AMP}amp; B ${AMP}lt;6${AMP}gt; ${AMP}quot;q${AMP}quot; ${AMP}#39;s${AMP}#39;`)).toBe(
      `A & B <6> "q" 's'`,
    );
  });

  test("非递归:&amp;lt; 只解一次成 &lt;", () => {
    const AMP = chr(38);
    expect(decodeEntities(`${AMP}amp;lt;`)).toBe(`${AMP}lt;`);
  });

  test("无实体时原样返回", () => {
    expect(decodeEntities("普通文本")).toBe("普通文本");
  });
});

describe("escapeHtmlWithLinks", () => {
  test("裸 http(s) 链接转成 <a>,带 target/rel", () => {
    const html = escapeHtmlWithLinks("见 https://example.com/x 完毕");
    expect(html).toContain(`href="https://example.com/x"`);
    expect(html).toContain(`target="_blank"`);
    expect(html).toContain(`rel="nofollow noopener noreferrer"`);
  });

  test("URL 里的 & 不被截断(href 保留完整 query)", () => {
    const AMP = chr(38);
    const html = escapeHtmlWithLinks(`https://example.com/?a=1${AMP}b=2`);
    expect(html).toContain(`href="https://example.com/?a=1${AMP}amp;b=2"`);
  });

  test("javascript: / data: 不转成链接", () => {
    const html = escapeHtmlWithLinks("javascript:alert(1) data:text/html,x");
    expect(html).not.toContain("<a ");
  });

  test("链接末尾的中英文标点不并入链接", () => {
    const html = escapeHtmlWithLinks("见 https://example.com/path。");
    expect(html).toContain(`href="https://example.com/path"`);
    expect(html).toContain("</a>。");
  });

  test("紧跟链接的中文不被吞进链接", () => {
    const html = escapeHtmlWithLinks("链接https://example.com好的");
    expect(html).toContain(`href="https://example.com"`);
    expect(html).toContain("</a>好的");
  });

  test("括号配对时末尾 ) 属于链接本体", () => {
    const html = escapeHtmlWithLinks("https://example.com/wiki/Foo_(bar)");
    expect(html).toContain(`href="https://example.com/wiki/Foo_(bar)"`);
  });

  test("无链接时只转义,不留 <a>", () => {
    const html = escapeHtmlWithLinks(`<b>x</b> ${chr(38)}`);
    expect(html).not.toContain("<a ");
    expect(html).toContain(`&lt;b&gt;`);
    expect(html).toContain(`&amp;`);
  });

  test("maxLinkTextLength 截断显示文本,href 仍是完整 URL", () => {
    const long = "https://example.com/" + "a".repeat(80);
    const html = escapeHtmlWithLinks(long, { maxLinkTextLength: 20 });
    expect(html).toContain(`href="${long}"`);
    expect(html).toContain("…");
  });

  test("空字符串原样返回", () => {
    expect(escapeHtmlWithLinks("")).toBe("");
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
