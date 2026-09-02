# 低优先级审查发现（待修复清单）

> 来源：完整代码审查（2026-09-02）。只读诊断，未改动代码。
> 用户决策：Low 项先记录到根目录此文件，修复说明由用户下一条回复给出。
> 约定冲突之处已标注「违反项目约定」；纯建议/无条件项标注「建议」。

---

## A. TypeScript 类型卫生

1. **双转义 `as unknown as` 丢弃结构校验** — `app/components/TravelMap.vue:534`（`points as unknown as AMap.Marker[]`）、`:793`、`:831`（`cluster?.setMap(null as unknown as AMap.Map)`）。
   → 结构兼容时用单 `as`；`setMap(null)` 改显式 `setMap(map: AMap.Map | null)` 包装。（`server/utils/data-transfer.ts:43` 有注释说明是刻意收口点，可接受。）
2. **环境变量非空断言** — `server/utils/prisma.ts:8-9` `process.env.DB_PASSWORD!` / `DB_NAME!`。缺失时在 Prisma 层抛隐晦错误。
   → 启动时显式 `if (!process.env.DB_PASSWORD) throw new Error("...")`，或与上方 host/port 一致用 `|| "default"` 兜底。
3. **`getHeader(...) as string` 掩盖 `undefined`** — `server/api/admin/comments/[id].delete.ts:33`、`contents/[cid].delete.ts:18`、`categories/[id].delete.ts:25`、`links/[id].delete.ts:31`、`tags/[id].delete.ts:24`、`subscribes/[id].delete.ts:32`。
   → 去掉 `as string`，传 `string | undefined`（`validateCsrfToken` 本就接受可选）。
4. **`JSON.parse(cached) as typeof responseData`** — `server/api/search.get.ts:443`。缓存 schema 漂移会静默错配。
   → 用 `safeParse`/类型守卫，或在写入时带上版本号。
5. **cast 改错误形状** — `app/pages/search.vue:57`、`app/pages/archiving.vue:9` `(fetchError as Error & HandledError).__handled__ = true`。
   → 用可选字段或独立 `Ref`。
6. **`DOMPurify.sanitize(...) as string`** — `server/api/comments.post.ts:186`、`server/api/mini/comments.post.ts:182`。若 typings 返回 `TrustedHTML` 会丢弃该信息（现无害）。
7. **双层校验不一致** — `server/utils/schemas.ts:80` `name: max(50)` vs `server/utils/validation.ts:33` `validateMaxLength(data.name, 255)`。严格者（50）生效，但两层意见冲突。
   → 对齐成一个值。
8. **手工泛型覆盖 InternalApi（已知 workaround）** — `app/pages/map.vue:67`（`useFetch<BlogNetworkData>`）、`app/types/apis/admin/*.d.ts`（注释已说明是 InternalApi 深度递归的回避）。属已知取舍。
   → 每份 d.ts 加注对应 handler，降低漂移风险。

## B. 约定违规（「类型放独立文件」）

9. **组件体内联类型** — `app/components/MarkdownEditor.vue:1166` `type TopBlockMd = {...}`。
   → 移到 `app/types/components/*.d.ts`（`~/types/components`）。
10. **组件邻近 `.ts` 内联接口** — `app/components/markdown-editor/mdInsert.ts:14` `export interface MdModelRef`、`:19` `export type MdTarget = HTMLTextAreaElement | null`。

## C. 前端 / UX 卫生

11. **`v-for :key="index"`** — `app/components/WaterfallGrid.vue:36`。列表变动时 DOM 态（Lazy LivePhoto blob/loaded）错位复用。
    → 用稳定 key（`item.slug ?? item.cid ?? index`）。
12. **`onMounted` 内裸 `setTimeout` 无清理** — `app/pages/index.vue:1189` `setTimeout(invalidateOffsets, 3000)`。当前仅清两个缓存偏移属无害，但缺 `onUnmounted` 清理。

## D. 数据访问 / 性能

13. **公开详情泄漏内部 PK** — `server/api/contents/[category]/[slug].get.ts:169` 返回 `user.uid`（用户主键）及 `contentrelations` 的 `cid/mid`。
    → 作者 `select` 去 `uid`；relations 映射成命名对象或去掉 `mid/cid`。
14. **单文全部评论一次拉取** — `server/api/comments.get.ts:35-56`、`server/api/mini/comments.get.ts:56-67`。注释写明 `pageSize ≤ 10000` 是契约；若单文可能超数千条建议加服务端硬顶。
15. **内存聚合热力数据** — `server/api/heatmap.get.ts:28-60` 拉全量文章+评论 `create_time` 到内存按天聚合，无 SQL `GROUP BY`，也无 Cache-Control。
    → 下沉到 DB（`GROUP BY DAY(create_time)` via `$queryRaw`）或加近窗。
16. **订阅刷新串行** — `server/utils/rss.ts:184` `updateAllSubscribes` 逐一刷新。无正确性风险，仅冷启动慢。
    → 可 `Promise.all` + 并发上限。

## E. 安全加固（低风险）

17. **authCode 用明文 `!==`** — `server/lib/auth.ts:103`。与 `csrf.ts:64`、`mini-auth.ts:93` 的 `timingSafeEqual` 不一致；authCode 为 43 字符随机、实际难计时攻击。
    → 统一换 `timingSafeEqual`。
18. **公开任意公网 URL 拉取、无速率限制** — `server/api/check-link.get.ts:17-27`。非内网 SSRF（safe-fetch + pinned IP），但是「公网 SSRF 探测 / 资源滥用」杠杆。
    → 加 IP + 每用户限流。
19. **上传扩展名取自客户端文件名** — `server/api/attachments/upload.post.ts:55-60` `path.extname(file.name)`。（内容已魔数校验、served 为 octet-stream，非 XSS。）
    → 由检测到的类型推导扩展名。
20. **logout POST 无 CSRF** — `server/api/auth/logout.post.ts:3-7`。`sameSite:strict` 下跨站 POST 不带 cookie，实为无害 no-op。
    → 视情况加，非紧急。
