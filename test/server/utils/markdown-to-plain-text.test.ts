import { describe, expect, test } from "bun:test";

import { markdownToPlainText, spaceCjkLatin } from "#server/utils/markdownToPlainText";

describe("markdownToPlainText:基础", () => {
  test("空输入返回空串", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText(null)).toBe("");
    expect(markdownToPlainText(undefined)).toBe("");
  });

  test("标题/加粗/斜体/删除线去掉标记保留文字", () => {
    const t = markdownToPlainText("# 标题\n\n**粗** *斜* ~~删~~");
    expect(t).toContain("标题");
    expect(t).toContain("粗");
    expect(t).not.toContain("**");
    expect(t).not.toContain("~~");
  });

  test("链接只保留锚文字,URL 不落进纯文本", () => {
    const t = markdownToPlainText("[点我](https://example.com/x)");
    expect(t).toContain("点我");
    expect(t).not.toContain("https://example.com/x");
  });

  test("内联代码与 HTML 实体被还原为纯文本", () => {
    const t = markdownToPlainText("用 `a < b` 比较 &amp; 与 &lt;tag&gt;");
    expect(t).toContain("a < b");
    expect(t).toContain("&");
    expect(t).toContain("<tag>");
  });

  test("列表去标记", () => {
    const t = markdownToPlainText("- 甲\n- 乙\n\n1. 丙");
    expect(t).toContain("甲");
    expect(t).toContain("乙");
    expect(t).toContain("丙");
    expect(t).not.toContain("- 甲");
  });
});

describe("markdownToPlainText:占位符替换", () => {
  test("图片渲染为 <图片：标题> 中文占位", () => {
    expect(markdownToPlainText("![风景](/imgs/a.webp)")).toContain("<图片：风景>");
  });

  test("无标题图片占位不带标题", () => {
    const t = markdownToPlainText("![](/imgs/a.webp)");
    expect(t).toContain("<图片>");
  });

  test("代码块占位含语言与行数", () => {
    const t = markdownToPlainText("```js\nconst a = 1;\nconst b = 2;\n```");
    expect(t).toContain("<代码块");
    expect(t).toContain("js");
    expect(t).toContain("2");
  });

  test("表格占位含行列数", () => {
    const t = markdownToPlainText("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(t).toContain("<表格");
  });

  test(":::music 容器转音乐占位", () => {
    const t = markdownToPlainText([":::music netease | song | 186016", ":::"].join("\n"));
    expect(t).toContain("<音乐");
  });

  test(":::live-photo 转实况照片占位", () => {
    const t = markdownToPlainText(":::live-photo /uploads/a.jpg 标题文字\n:::");
    expect(t).toContain("<实况照片");
    expect(t).toContain("标题文字");
  });

  test("未闭合容器回退为普通文本(不吞正文)", () => {
    const t = markdownToPlainText(":::callout info\n正文内容没有闭合");
    expect(t).toContain("正文内容没有闭合");
  });
});

describe("spaceCjkLatin", () => {
  test("中英文之间补空格", () => {
    expect(spaceCjkLatin("中文English混合")).toBe("中文 English 混合");
  });

  test("已有空格不重复补", () => {
    expect(spaceCjkLatin("中文 English")).toBe("中文 English");
  });

  test("纯中文/纯英文不改变", () => {
    expect(spaceCjkLatin("纯中文")).toBe("纯中文");
    expect(spaceCjkLatin("pure english")).toBe("pure english");
  });
});

describe("markdownToPlainText:其余容器占位", () => {
  test("video / details / callout / card / simple-card / repo / swiper / waterfall", () => {
    expect(markdownToPlainText([":::video /x.mp4", ":::"].join("\n"))).toContain("<视频");
    expect(markdownToPlainText([":::details 点开", "内容", ":::"].join("\n"))).toContain("<折叠");
    // callout 保留内部正文、丢弃开闭行
    const callout = markdownToPlainText([":::callout warning", "小心内容", ":::"].join("\n"));
    expect(callout).toContain("小心内容");
    expect(callout).not.toContain("callout");

    expect(markdownToPlainText([":::card https://a.com | 标题", ":::"].join("\n"))).toContain("<链接卡片");
    expect(markdownToPlainText([":::simple-card https://a.com | 标题", ":::"].join("\n"))).toContain("<外链卡片");
  });

  test("repo 容器按平台给出仓库占位", () => {
    const gh = markdownToPlainText([":::repo https://github.com/imqi1/imqi1-cms", ":::"].join("\n"));
    expect(gh).toContain("仓库");
    expect(gh).toContain("imqi1");
  });

  test("swiper / waterfall 图集转图片占位", () => {
    const swiper = markdownToPlainText([":::swiper", "![图一](/a.jpg)", ":::"].join("\n"));
    expect(swiper).toContain("<图片");
  });

  test("代码块语言未知时给出行数占位", () => {
    const t = markdownToPlainText(["```", "line1", "line2", "```"].join("\n"));
    expect(t).toContain("<代码块");
    expect(t).toContain("2");
  });

  test("行内表情占位符保留原样(端上再解析)", () => {
    const t = markdownToPlainText("看这个 :[heo-微笑] 好看");
    expect(t).toContain(":[heo-微笑]");
  });
});

describe("markdownToPlainText:repo / music 兜底分支", () => {
  test("repo:gitee 走 Gitee 仓库占位(不是 GitHub)", () => {
    const gitee = markdownToPlainText([":::repo https://gitee.com/imqi1/blog", ":::"].join("\n"));
    expect(gitee).toContain("Gitee");
    expect(gitee).toContain("imqi1/blog");
    expect(gitee).not.toContain("GitHub");
  });

  test("repo:非 github/gitee 主机 → 「<仓库卡片>」兜底,不假装识别", () => {
    const t = markdownToPlainText([":::repo https://gitlab.com/foo/bar", ":::"].join("\n"));
    expect(t).toContain("<仓库卡片>");
    expect(t).not.toContain("GitHub");
    expect(t).not.toContain("Gitee");
  });

  test("repo:github.com 缺 owner/repo 段(只是首页)→ 兜底", () => {
    const t = markdownToPlainText([":::repo https://github.com/", ":::"].join("\n"));
    expect(t).toContain("<仓库卡片>");
  });

  test(":::music auto URL:网易云歌曲链接 → 带 id 的中文占位", () => {
    const t = markdownToPlainText([":::music auto https://music.163.com/song?id=186016", ":::"].join("\n"));
    expect(t).toContain("<音乐");
    expect(t).toContain("网易云");
    expect(t).toContain("186016");
  });

  test(":::music auto URL:酷我歌曲链接 → 中文占位", () => {
    const t = markdownToPlainText([":::music auto https://www.kuwo.cn/song/12345", ":::"].join("\n"));
    expect(t).toContain("酷我");
    expect(t).toContain("12345");
  });

  test(":::music auto URL:酷狗歌曲链接 → 中文占位", () => {
    const t = markdownToPlainText([":::music auto https://www.kugou.com/song/abc123.html", ":::"].join("\n"));
    expect(t).toContain("酷狗");
    expect(t).toContain("abc123");
  });

  test(":::music auto URL:不在任何已知平台 → 「<音乐>」兜底", () => {
    const t = markdownToPlainText([":::music auto https://spotify.com/track/xyz", ":::"].join("\n"));
    expect(t).toContain("<音乐>");
    expect(t).not.toContain("网易云");
  });

  test(":::music 参数完全不符合(song/playlist/album/artist)→ 「<音乐>」兜底", () => {
    const t = markdownToPlainText([":::music xyz netease 123", ":::"].join("\n"));
    expect(t).toContain("<音乐>");
  });

  test(":::music 形式 2 给出标准占位(<音乐:平台,id=x> 类)", () => {
    const t = markdownToPlainText([":::music playlist netease 999", ":::"].join("\n"));
    expect(t).toContain("<音乐列表");
    expect(t).toContain("网易云");
    expect(t).toContain("999");
  });
});

describe("markdownToPlainText:decodeEntities 与 pre 块", () => {
  test("常用 HTML 实体一次性解码:&lt; &gt; &amp; &quot; &apos; &nbsp;", () => {
    const t = markdownToPlainText("a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos; &nbsp;e");
    expect(t).toContain("a <b>");
    expect(t).toContain("&");
    expect(t).toContain('"c"');
    expect(t).toContain("'d'");
    // &nbsp; → U+00A0 (非换行空格,不是普通空格)
    expect(t).toContain(" e");
  });

  test("&amp;lt; 不二次解码成 <(防止递归放大)", () => {
    // 源里写的就是 &amp;lt; (被字面渲染成 "&lt;"),不应被解成 "<"
    const t = markdownToPlainText("&amp;lt;tag&amp;gt;");
    expect(t).toContain("&lt;tag&gt;");
    expect(t).not.toContain("<tag>");
  });

  test("inline html <pre> 不带语言时(罕见路径)→ 「<代码块:共x行>」兜底占位", () => {
    // html:false 下原始 <pre> 被去标签前先经 preBlocksToPlaceholders;用 4 空格缩进代码触发
    const t = markdownToPlainText("    line1\n    line2\n    line3");
    expect(t).toContain("<代码块");
    expect(t).toContain("3");
  });

  test("图片有 title 时,title 优先作为占位标签(alt 为空)", () => {
    const t = markdownToPlainText('![](/imgs/a.jpg "标题-t")');
    expect(t).toContain("标题-t");
  });

  test("图片 src 含 #live → 实况照片占位(无标题)", () => {
    const t = markdownToPlainText("![](/imgs/lp.jpg#live)");
    expect(t).toContain("<实况照片");
  });

  test("图片 alt 含 [live] 标识 → 实况照片占位", () => {
    const t = markdownToPlainText("![alt [live] text](/imgs/lp.jpg)");
    expect(t).toContain("<实况照片");
  });
});

describe("markdownToPlainText:容器嵌套与多行", () => {
  test("嵌套 callout(开两层 :::callout warning),内部正文仍保留", () => {
    const t = markdownToPlainText([
      ":::callout info",
      "外层",
      ":::callout warning",
      "内层",
      ":::",
      ":::", // 外层闭合
    ].join("\n"));
    expect(t).toContain("外层");
    expect(t).toContain("内层");
    expect(t).not.toContain("callout");
  });

  test("未闭合 swiper:开启行 + 内容行全回退为普通文本(不吞)", () => {
    const t = markdownToPlainText([
      ":::swiper",
      "![图](/a.jpg)",
      "(没有闭合 :::)",
    ].join("\n"));
    // 没闭合 → 不产 <图片集> 占位
    expect(t).not.toContain("<图片集");
    // 内容保留
    expect(t).toContain("没有闭合");
  });

  test("多行 :::card:四段 pipe 参数 → 占位带标题", () => {
    const t = markdownToPlainText([
      ":::card https://x.com | 我的标题 | 我的描述 | https://x.com/i.png",
      ":::", // 不需要闭合,但写了也不抛
    ].join("\n"));
    expect(t).toContain("我的标题");
  });
});
