---
name: cos-signature-gotchas
description: COS 签名三坑：Node fetch 禁设 Date/Host 致鉴签 403;SignKey/q-signature/Authorization 别 console.log;一次请求只读一次 config/domain
metadata:
  node_type: memory
  type: project
---

`server/utils/cos.ts` 生成腾讯云 COS 签名(官方 v5 算法),三个坑(2026-08-25 批3 修):

1. **别把 `date`/`host` 纳入签名的 headerList。** Node/undici 的 `fetch` 按 WHATWG 把 `Date`/`Host` 列为禁设头静默剥离(HTTP Date 不会补发、Host 由传输层按 URL 自动重建)。签名基于「实际发送的头」重算,若签了 Date 而请求里没有 → COS 验签失败 403。只签 fetch 会真正发送的 `content-md5`/`content-type` 即可(md5 用 `createHash("md5").update(buf).digest("base64")`)。要签任意头须改用 `http/https.request` 或官方 `cos-nodejs-sdk`。
2. **别把签名产物 `console.log`。** `SignKey`(HMAC-SHA1(SecretKey,keyTime))、`Authorization`(含 `q-ak=SecretId`、`q-signature`)、`StringToSign` 都不是可公开的——打进 stdout 后,读到日志者可在 600s 签名窗口内伪造对 COS 的 PUT/DELETE。日志只记非敏感摘要(Bucket/Region/文件名/状态码)。
3. **一次请求只读一次配置。** `getCosConfig()/getCosDomain()` 各查一次 informations 表;`uploadToCOS/deleteFromCOS` 若再叠 `validateCosConfig` 会重复查库。让 getCosDomain 接受 `existingConfig` 参数、hot path 只取一份 config+domain。
