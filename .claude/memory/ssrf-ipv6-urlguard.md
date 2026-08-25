---
name: ssrf-ipv6-urlguard
description: urlGuard IPv6 私网判定须按 CIDR 而非字符串前缀;Node URL 把 IPv4 映射规范化成十六进制;DNS rebinding 仍是开放局限
metadata:
  node_type: memory
  type: security
---

`server/utils/urlGuard.ts` 的 `isPrivateIp` IPv6 分支坑(2026-08-25 批3 修):

- **Node WHATWG URL 会把 IPv4 映射地址规范化成十六进制**:`http://[::ffff:169.254.169.254]/` → hostname `[::ffff:a9fe:a9fe]`。旧实现只匹配点分十进制 `/::ffff:a.b.c.d$/`,漏判 hex 形式 → 云元数据 `169.254.169.254` 直达。
- **`fe80` 前缀只覆盖 fe80::/10 的一小段**;链路本地应 `(parts[0] & 0xffc0) === 0xfe80`(fe81...febf 也是),唯一本地用 `(parts[0] & 0xfe00) === 0xfc00`。
- 正确做法:展开 IPv6 为 8 组(处理 `::` 压缩),按 CIDR 判定;内嵌 IPv4(含 hex 形式)还原成点分交给 IPv4 逻辑。别用字符串 startsWith/===。
- **已知开放局限**:`assertPublicHttpUrl` 先解析校验再返回 hostname 键的 URL,调用方 fetch 时**重新解析 DNS** → 经典 DNS rebinding TOCTOU。真修需 undici 自定义 dispatcher 把已校验 IP 钉到连接(或连接后校验对端地址),两个消费方(check-link.get.ts、links.post.ts)应共用同一 fetch 封装。
