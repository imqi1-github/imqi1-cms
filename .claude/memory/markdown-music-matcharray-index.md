---
name: markdown-music-matcharray-index
description: markdown.ts transformMusicLinks 的 replace 回调,args.slice(0,-2) 去的是 offset/string,须前置完整 match 否则音乐播放器转换失效
metadata:
  node_type: memory
  type: project
---

`server/utils/markdown.ts` 的 `transformMusicLinks` 用 `String.replace(regex, (match, linkText, ...args) => ...)` 把 `[text](音乐URL)` 转 `:::music ...:::` 播放器容器。replace 回调末 2 个参数恒为 `offset` 和 `string`,`args.slice(0,-2)` 取的是**捕获组**(type,id),**不含**完整 match → `platform.getType(matchArray)` 读 `match[1]` 拿到的是 id、`getId` 读到 undefined → `if (id)` 永假 → **四种平台(网易/腾讯/酷我/酷狗)的音乐链接都保持原样,播放器功能整体失效**(2026-08-25 修)。

修法:`const matchArray = [match, ...args.slice(0, -2)] as RegExpMatchArray;`,让索引对齐平台定义(`matchArray[1]=type`、`matchArray[2]=id`)。

**注意**:`transformMusicLinks` 在 markdown-it 解析**之前**对原始 markdown 串做替换——一旦修好,位于 ``` 代码围栏内的音乐 URL 也会被误转(渲染时在代码块里仍是字面文本,影响小;要彻底需跳过围栏区)。关联 [[tiptap-markdown-roundtrip-gotchas]]。
