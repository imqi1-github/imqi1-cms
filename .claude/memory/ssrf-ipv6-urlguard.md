---
name: ssrf-ipv6-urlguard
description: urlGuard IPv6 私网判定须按 CIDR 而非字符串前缀;Node URL 把 IPv4 映射规范化成十六进制;DNS rebinding 已由 safe-fetch.ts 钉定 IP 封掉(undici 双份不兼容坑)
metadata:
  node_type: memory
  type: security
---

`server/utils/urlGuard.ts` 的 `isPrivateIp` IPv6 分支坑(2026-08-25 批3 修):

- **Node WHATWG URL 会把 IPv4 映射地址规范化成十六进制**:`http://[::ffff:169.254.169.254]/` → hostname `[::ffff:a9fe:a9fe]`。旧实现只匹配点分十进制 `/::ffff:a.b.c.d$/`,漏判 hex 形式 → 云元数据 `169.254.169.254` 直达。
- **`fe80` 前缀只覆盖 fe80::/10 的一小段**;链路本地应 `(parts[0] & 0xffc0) === 0xfe80`(fe81...febf 也是),唯一本地用 `(parts[0] & 0xfe00) === 0xfc00`。
- 正确做法:展开 IPv6 为 8 组(处理 `::` 压缩),按 CIDR 判定;内嵌 IPv4(含 hex 形式)还原成点分交给 IPv4 逻辑。别用字符串 startsWith/===。
  该展开函数 `expandIpv6` 已于 2026-09-14 从本文件**搬到 `server/utils/ip-match.ts`**，供本模块与 `TRUSTED_PROXY` 白名单共用（见 [[trusted-proxy-cidr-and-docker-ip-collapse]]）；本文件显式 `import` 它。

**DNS rebinding TOCTOU 已封(2026-09 订正,早先记「仍是开放局限」已过时)**:`server/utils/safe-fetch.ts` 的 `fetchPublicUrl` 用 undici 自定义 dispatcher 把连接**钉定到已校验的公网 IP**(`Agent.connect.lookup` 固定返回 `resolvePublicIps` 的结果,fetch 不再二次解析 DNS),重定向走 `redirect:"manual"` **每跳重新 SSRF 校验 + 重新钉 IP**;已覆盖 rss.ts / check-link.get.ts / links.post.ts 三个消费方。新外联消费方一律走 `fetchPublicUrl`,别直接 fetch 用户提供的 URL。

**safe-fetch 的 undici 双份坑**:那里 `fetch` 必须从 `undici` 包导入、**不能要全局 fetch**——全局 fetch 由 Node 内置的另一份 undici 提供,本包 `Agent` 当 dispatcher 传给它抛 `UND_ERR_INVALID_ARG: invalid onRequestStart method`,**所有服务端外联(友链检测/RSS 抓取)全量失败**且报错不指向根因。
