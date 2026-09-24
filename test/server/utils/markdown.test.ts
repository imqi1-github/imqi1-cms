import { describe, expect, test } from "bun:test";

import { renderMarkdown, renderSimpleMarkdown } from "#server/utils/markdown";

// 集成测试:markdown-it + Shiki + 自定义容器 + link chip + transformMusicLinks + sanitizeHtml 全链路
describe("renderMarkdown:基础渲染", () => {
  test("标题与段落", async () => {
    const html = await renderMarkdown("# 标题\n\n正文一段。");
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<p>正文一段。</p>");
  });

  test("空内容返回空串", async () => {
    expect(await renderMarkdown("")).toBe("");
  });

  test("breaks:true 单换行渲染成 <br>", async () => {
    const html = await renderMarkdown("第一行\n第二行");
    expect(html).toContain("第一行<br>");
  });
});

describe("renderMarkdown:链接安全与域名图标", () => {
  test("外链自动加 target=_blank 与 rel=noopener noreferrer", async () => {
    const html = await renderMarkdown("[点我](https://example.com/page)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("GitHub 链接插入 --github 图标 span,链接本体不加 class", async () => {
    const html = await renderMarkdown("[repo](https://github.com/user/repo)");
    expect(html).toContain('<span class="markdown-link-icon markdown-link-icon--github" aria-hidden="true"></span>');
    expect(html).not.toContain('<a class=');
  });

  test("子域名命中优先于父域名:mp.weixin.qq.com 得 wechat 而非 tencent", async () => {
    const html = await renderMarkdown("[微信文章](https://mp.weixin.qq.com/s/abc)");
    expect(html).toContain("markdown-link-icon--wechat");
    expect(html).not.toContain("markdown-link-icon--tencent");
  });

  test("未知域名无图标", async () => {
    const html = await renderMarkdown("[别处](https://example.org/x)");
    expect(html).not.toContain("markdown-link-icon");
  });
});

describe("renderMarkdown:图片", () => {
  test("普通图片包装 figure + figcaption + 灯箱契约", async () => {
    const html = await renderMarkdown('![风景照](/imgs/a.webp)');
    expect(html).toContain('<figure class="markdown-figure">');
    expect(html).toContain("figcaption");
    expect(html).toContain("风景照</figcaption>");
    expect(html).toContain('data-lightbox="gallery"');
    expect(html).toContain('loading="lazy"');
  });

  test("#live 图片渲染成实况照片占位,data-params 为编码参数", async () => {
    const html = await renderMarkdown("![实况 [live]](/imgs/b.jpg)");
    expect(html).toContain("markdown-live-photo-wrapper");
    expect(html).not.toContain("<figure");
  });
});

describe("renderMarkdown:代码块", () => {
  test("js 走 Shiki 高亮并保留语言类", async () => {
    const html = await renderMarkdown("```js\nconst a = 1;\n```");
    expect(html).toContain("language-js");
    expect(html).toContain('class="line"');
  });

  test("py+study.py 的语言+文件名格式:高亮用 py,类名保留文件名", async () => {
    const html = await renderMarkdown("```py+study.py\nprint(1)\n```");
    expect(html).toContain("language-py+study.py");
  });

  test("未知语言退化为纯文本 pre 且内容被转义", async () => {
    const html = await renderMarkdown("```nojs\n<b>&x</b>\n```");
    expect(html).toContain("<pre class=\"shiki");
    expect(html).not.toContain("<b>");
  });
});

describe("renderMarkdown:容器", () => {
  test("details 容器渲染 data-summary", async () => {
    const html = await renderMarkdown("::: details 点开看\n内容\n:::");
    expect(html).toContain('data-summary="点开看"');
  });

  test("callout 只接受四类,type 写进 data-type", async () => {
    expect(await renderMarkdown("::: callout warning\n小心\n:::")).toContain('data-type="warning"');
    expect(await renderMarkdown("::: callout 不存在的类\nx\n:::")).not.toContain("markdown-callout-wrapper");
  });

  test("repo 容器只收 github/gitee 仓库 URL", async () => {
    expect(await renderMarkdown("::: repo https://github.com/a/b\n:::")).toContain("markdown-repo-wrapper");
    expect(await renderMarkdown("::: repo https://evil.com/a/b\n:::")).not.toContain("markdown-repo-wrapper");
  });

  test("live-photo 容器参数编码进 data-params", async () => {
    const html = await renderMarkdown("::: live-photo /imgs/c.jpg 标题文字\n:::");
    expect(html).toContain("markdown-live-photo-wrapper");
    expect(decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "")).toBe("/imgs/c.jpg 标题文字");
  });
});

describe("renderMarkdown:音乐链接转换", () => {
  test("网易云歌曲链接转 music 播放器容器", async () => {
    const html = await renderMarkdown("[歌曲](https://music.163.com/song?id=186016)");
    expect(html).toContain("markdown-music-wrapper");
    expect(decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "")).toBe("netease | song | 186016");
  });

  test("QQ音乐 songDetail 映射为 song 类型(mid 为字母数字)", async () => {
    const html = await renderMarkdown("[歌](https://y.qq.com/n/ryqq/songDetail/002Neh8l0UQbMz)");
    expect(decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "")).toContain("tencent | song");
  });

  test("容器独立成行,后续段落不被吞进播放器 div", async () => {
    const html = await renderMarkdown("[歌](https://music.163.com/song?id=186016)\n\n后续段落内容");
    const wrapperEnd = html.indexOf("</div>");
    const pStart = html.indexOf("<p>后续段落内容</p>");
    expect(pStart).toBeGreaterThan(wrapperEnd);
    expect(decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "")).toBe("netease | song | 186016");
  });

  test("不匹配的音乐 URL 保持原样渲染成普通链接", async () => {
    const html = await renderMarkdown("[歌](https://music.163.com/ discovering)");
    expect(html).not.toContain("markdown-music-wrapper");
  });
});

describe("renderMarkdown:净化管线(XSS 兜底)", () => {
  test("内联 <script> 整体剥离", async () => {
    const html = await renderMarkdown("hello\n\n<script>alert(1)</script>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("alert(1)");
  });

  test("HTML img 的事件处理器被剥离,标签保留", async () => {
    const html = await renderMarkdown('<img src="/x.png" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
    expect(html).toContain("<img");
  });

  test("javascript: 链接被 markdown-it 挡下,渲染为字面文本而非 <a>", async () => {
    const html = await renderMarkdown("[点](javascript:alert(1))");
    expect(html).not.toContain('<a href="javascript:');
    expect(html).toContain("[点](javascript:alert(1))");
  });

  test("data-* 属性默认放行(DOMPurify ALLOW_DATA_ATTR 默认 true)", async () => {
    const html = await renderMarkdown('<a href="/x" data-evil="1" data-summary="合法">go</a>');
    expect(html).toContain('data-evil="1"');
    expect(html).toContain('data-summary="合法"');
  });
});

describe("renderSimpleMarkdown(评论等短文本)", () => {
  test("html:false 内联 HTML 转义为纯文本", async () => {
    const html = renderSimpleMarkdown("a <b>bold</b> c");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });

  test("链接渲染但无 target=_blank(simpleMd 无自定义规则)", () => {
    const html = renderSimpleMarkdown("[x](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('target="_blank"');
  });

  test("空内容返回空串", () => {
    expect(renderSimpleMarkdown("")).toBe("");
  });
});
