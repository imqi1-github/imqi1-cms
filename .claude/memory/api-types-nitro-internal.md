---
name: api-types-nitro-internal
description: API 端到端类型走 Nitro 内置 InternalApi，不要再造 api:types 生成器
metadata: 
  node_type: memory
  type: project
  originSessionId: 39bc1142-e18c-48f3-bde8-84b41a60d011
---

API 响应类型现在全部由 Nuxt/Nitro 内置的 `InternalApi`（`.nuxt/types/nitro-routes.d.ts`，基于 server handler 返回值自动推断）提供。旧的 `api:types` 体系（`scripts/generate-api-types.ts` + `shared/api-types.generated.ts` + `ApiTypes`/`ApiPath`）已于 2026-06-27 删除——它写死 3 个端点、其余全 `any`，且写死的还和真实返回脱节（如 `/search` 漏了 `{code,message,data}` 外层）。

**⚠️ update（2026-08-23）**：`app/composables/useApi.ts`（useApi/useApiGet/useApiPost/$api/...）**已删除，仓库中不存在**（无 useApi/$api 封装）。现直接用 `useFetch`/`$fetch`（path 带 `/api` 前缀），响应类型靠 nitro 推断。`defineTypedApiHandler` 定义在 `server/types/typedApi.ts`（`server/api/comments.post.ts:10`、`search.get.ts:6`），入参 schema 在 `server/utils/schemas.ts`。

**Why:** Nuxt 4.4 的 Nitro 已经白送全路由响应类型推断，重造生成器是更差的轮子。

**How to apply:** 响应类型直接用 `useFetch`/`$fetch`（path 带 `/api` 前缀）；nitro **只推断响应、不生成请求 query/body schema**，入参要类型化就给该 handler 加 zod（`defineTypedApiHandler`（`server/types/typedApi.ts`）+ `server/utils/schemas.ts`），调用处局部 `z.infer`，**不要再建全局生成脚本**。已知边界：nitro 的 `NitroFetchRequest` 含字符串兜底，未知路径不会编译报错（只丢 autocomplete/响应类型），别误以为能做拼写检查。
