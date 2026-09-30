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

describe("renderMarkdown:getLinkChipDomain 兜底分支", () => {
  test("链接 URL 无效时(解析失败)命中兜底:不抛、不插入图标", async () => {
    // 缺协议 + 含非法字符的 URL,new URL 会抛 → getLinkChipDomain catch → 返回 null
    const html = await renderMarkdown("[bad](::::not a url::::)");
    expect(html).not.toContain("markdown-link-icon");
  });

  test("非 http/https 协议(如 ftp: / data:)不命中域名卡片", async () => {
    const ftp = await renderMarkdown("[t](ftp://github.com/foo)");
    const data = await renderMarkdown("[t](data:text/plain,abc)");
    expect(ftp).not.toContain("markdown-link-icon");
    expect(data).not.toContain("markdown-link-icon");
  });
});

describe("renderMarkdown:图片变体", () => {
  test("无 alt 文本的普通图片:仅 img,不包 figure/figcaption,灯箱契约保留", async () => {
    const html = await renderMarkdown("![](https://x.com/a.webp)");
    expect(html).toContain("<img");
    expect(html).toContain('data-lightbox="gallery"');
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("figcaption");
  });

  test("#live 实况照片且无 caption:data-params 只编码 src", async () => {
    // src 须带 #live 后缀触发实况照片分支(alt 留空)
    const html = await renderMarkdown("![](https://x.com/a.jpg#live)");
    expect(html).toContain("markdown-live-photo-wrapper");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("https://x.com/a.jpg#live");
  });
});

describe("renderMarkdown:代码块 parseFenceInfo 边界", () => {
  test("语言+文件名格式缺文件扩展分隔符(无 . / \\):回退用纯语言作 className", async () => {
    // parseFenceInfo: separatorIndex>0,「py+nosep」不在支持集,baseLang="py",possibleFileName="nosep"
    // 缺 . / \\ → 走 line 269 分支,返回 { shikiLang: "py", className: "py" }
    // fence: shikiLang="py" 受支持,shikiClassName="py" === className,不变替换
    const html = await renderMarkdown("```py+nosep\nprint(1)\n```");
    expect(html).toContain("language-py");
  });

  test("首字符为 + 的 fence(separatorIndex=0):走语言原样返回分支后由未知语言兜底", async () => {
    // separatorIndex=0 ≤ 0 → { shikiLang: "+nosep", className: "+nosep" }
    // +nosep 不在支持集 → renderPlainCode 纯文本兜底,className 直接拼成 language-+nosep
    const html = await renderMarkdown("```+nosep\nx\n```");
    expect(html).toContain('<pre class="shiki language-+nosep"');
  });

  test("info 仅空白(无语言):走 renderPlainCode,不抛", async () => {
    const html = await renderMarkdown("```\nplain\n```");
    expect(html).toContain("<pre class=\"shiki");
  });
});

describe("renderMarkdown:容器扩展覆盖", () => {
  test("video 容器:data-url 转义编码,不含协议无关字符", async () => {
    // validate "^video\\s+(.+)$" 捕获整行,URL 后不要写多余内容(否则被一起塞进 data-url)
    const html = await renderMarkdown("::: video https://example.com/v.mp4\n:::");
    expect(html).toContain("markdown-video-wrapper");
    expect(html).toMatch(/data-url="https:\/\/example\.com\/v\.mp4"/);
  });

  test("card 容器:四段 pipe 参数编码进 data-params", async () => {
    const html = await renderMarkdown("::: card https://x.com/a | 标题 | 描述 | https://x.com/i.png\n:::");
    expect(html).toContain("markdown-card-wrapper");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("https://x.com/a | 标题 | 描述 | https://x.com/i.png");
  });

  test("simple-card 容器:两段 pipe 参数编码", async () => {
    const html = await renderMarkdown("::: simple-card https://x.com/a | 标题\n:::");
    expect(html).toContain("markdown-simple-card-wrapper");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("https://x.com/a | 标题");
  });

  test("swiper 容器:无参数,只产包裹 div", async () => {
    const html = await renderMarkdown("::: swiper\n:::");
    expect(html).toContain("markdown-swiper-wrapper");
    expect(html).not.toContain("data-");
  });

  test("waterfall 容器:无参数,只产包裹 div", async () => {
    const html = await renderMarkdown("::: waterfall\n:::");
    expect(html).toContain("markdown-waterfall-wrapper");
    expect(html).not.toContain("data-");
  });

  test("music 容器:直接写 :::music 语法(非链接转换路径)", async () => {
    const html = await renderMarkdown("::: music netease | song | 123\n:::");
    expect(html).toContain("markdown-music-wrapper");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("netease | song | 123");
  });

  test("live-photo 容器:无标题时 data-params 仅含 URL", async () => {
    const html = await renderMarkdown("::: live-photo /imgs/a.jpg\n:::");
    expect(html).toContain("markdown-live-photo-wrapper");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("/imgs/a.jpg");
  });

  test("details 容器:仅 details(无标题)被识别为段落,不触发容器", async () => {
    // validate 要求 "^details\\s+(.*)$":details 后必须有空白 + 内容;否则整段当段落渲染。
    // 「data-summary=展开」兜底不可达,跳过该断言。
    const html = await renderMarkdown("::: details\n内容\n:::");
    expect(html).not.toContain("markdown-details-wrapper");
  });

  test("callout 四种类型(success/warning/error/info)data-type 正确", async () => {
    for (const type of ["success", "warning", "error", "info"]) {
      const html = await renderMarkdown(`::: callout ${type}\nx\n:::`);
      expect(html).toContain(`data-type="${type}"`);
    }
  });

  test("callout type 非枚举时 validate 拒绝,不产包裹 div", async () => {
    const html = await renderMarkdown("::: callout debug\nx\n:::");
    expect(html).not.toContain("markdown-callout-wrapper");
  });

  test("repo 容器:gitee 仓库也走 wrapper", async () => {
    const html = await renderMarkdown("::: repo https://gitee.com/a/b\n:::");
    expect(html).toContain("markdown-repo-wrapper");
    expect(html).toContain('data-url="https://gitee.com/a/b"');
  });
});

describe("renderMarkdown:音乐链接 - 其它平台 + 空匹配", () => {
  test("QQ 音乐歌单转 playlist 类型", async () => {
    const html = await renderMarkdown("[歌单](https://y.qq.com/n/ryqq/playlist/1234567)");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("tencent | playlist | 1234567");
  });

  test("酷我音乐歌曲链接转播放器容器", async () => {
    const html = await renderMarkdown("[kuwo](https://www.kuwo.cn/song/12345)");
    expect(html).toContain("markdown-music-wrapper");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("kuwo | song | 12345");
  });

  test("酷狗音乐歌曲链接转播放器容器", async () => {
    const html = await renderMarkdown("[kugou](https://www.kugou.com/song/abc123.html)");
    expect(html).toContain("markdown-music-wrapper");
    const params = decodeURIComponent(/data-params="([^"]+)"/.exec(html)?.[1] ?? "");
    expect(params).toBe("kugou | song | abc123");
  });

  test("网易云歌单 + 专辑分别转 playlist/album 类型", async () => {
    const playlist = decodeURIComponent(
      /data-params="([^"]+)"/.exec(await renderMarkdown("[p](https://music.163.com/playlist?id=123)"))?.[1] ?? "",
    );
    const album = decodeURIComponent(
      /data-params="([^"]+)"/.exec(await renderMarkdown("[a](https://music.163.com/album?id=456)"))?.[1] ?? "",
    );
    expect(playlist).toBe("netease | playlist | 123");
    expect(album).toBe("netease | album | 456");
  });

  test("不匹配的 URL(无协议 + 非已知平台)保持原链接,不替换为播放器", async () => {
    const html = await renderMarkdown("[plain](https://spotify.com/track/abc)");
    expect(html).not.toContain("markdown-music-wrapper");
    expect(html).toContain("spotify.com");
  });
});
