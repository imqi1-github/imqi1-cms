# API 类型与校验

本项目前后端类型由 **Nuxt 的 InternalApi 自动推断**,无需生成器。

## 响应类型 —— 全自动

Nuxt 扫描 `server/api/**`,把每个 handler 的真实返回值(含 Prisma 对象)写入 `.nuxt/types/nitro-routes.d.ts` 的 `InternalApi`。前端用原生 `$fetch` / `useFetch` 即可直接拿到强类型,**不要**加 `as any` 或手动 `<{...}>` 泛型(那会压制推断)。

```ts
// ✅ 正确:response 自动是 site handler 的真实形状
const response = await $fetch('/api/site')

// ❌ 错误:压制了类型推断
const response = await $fetch('/api/site') as any
const { data } = await useFetch<{ data?: {...} }>('/api/search')
```

## 请求校验 —— defineTypedApiHandler(可选)

需要运行时校验入参(query/body)的接口,用 `server/utils/typedApi.ts` 的 `defineTypedApiHandler` + `server/api/schemas.ts` 里的 zod schema。它提供**运行时校验**,响应类型仍由 InternalApi 从返回值推断,不依赖任何生成文件。

当前使用该模式的接口:

| 方法 | 路径 |
|------|------|
| GET | `/api/search` |
| GET | `/api/site` |
| POST | `/api/comments` |

### 示例

```ts
// server/api/search.get.ts
export default defineTypedApiHandler(
  { query: SearchQuerySchema },
  async (event, { query }) => {
    // query 已被 zod 校验并类型化
    return { results, total, query: query.q }
  },
)
```

### 添加新的校验接口

1. 在 `server/api/schemas.ts` 定义 `{Name}QuerySchema` / `{Name}CreateSchema`
2. handler 用 `defineTypedApiHandler({ query|body: XxxSchema }, async (event, { query|body }) => { ... })`
3. 直接调用,无需运行任何生成命令

## 路径参数

模板字符串路径(如 `` $fetch(`/api/posts/${cat}/${slug}`) ``)无法被 InternalApi 匹配到对应路由类型,会回退为 `unknown`。此时用显式标注补回(非 `any`):

```ts
import type { InternalApi } from 'nitropack/types'
type R = InternalApi['/api/posts/:category/:slug']['get']
const post = await $fetch<R>(`/api/posts/${cat}/${slug}`)
```

## 类型检查

```bash
bunx nuxi typecheck   # 确保响应类型收紧到位、无 any 残留
```
