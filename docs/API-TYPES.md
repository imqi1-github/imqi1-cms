# API 类型安全全链路打通

本文档介绍如何使用项目中的类型安全 API 系统。

## 概述

本项目实现了一套完整的前后端类型安全方案，基于 Zod 和 Nuxt，确保 API 请求和响应的类型一致性。

## 核心特性

- ✅ **运行时验证**: API 请求参数自动验证
- ✅ **类型自动生成**: 自动扫描 API 文件生成前端类型
- ✅ **类型安全调用**: 前端 `useApi` composable 提供完整类型提示
- ✅ **Schema 集中管理**: 所有 API Schema 统一维护

## 快速开始

### 1. 生成 API 类型

```bash
# 手动生成类型
bun api:types

# 构建时会自动执行
bun build
```

### 2. 后端 API 定义示例

#### GET 请求（带查询参数）

```typescript
// server/api/search.get.ts
import { defineTypedApiHandler } from "#server/utils/typedApi";
import { SearchQuerySchema, SearchResponseSchema } from "./schemas";

export default defineTypedApiHandler(
  {
    query: SearchQuerySchema,
    response: SearchResponseSchema,
    description: "文章搜索接口",
  },
  async (event, { query }) => {
    // query 自动获得类型提示
    const { q } = query;

    // ... 业务逻辑

    return {
      results: [...],
      total: 100,
      query: q,
    };
  }
);
```

#### POST 请求（带请求体）

```typescript
// server/api/comments/index.post.ts
import { defineTypedApiHandler } from "#server/utils/typedApi";
import { CommentCreateSchema, CommentItemSchema } from "../schemas";

export default defineTypedApiHandler(
  {
    body: CommentCreateSchema,
    response: CommentItemSchema,
    description: "提交评论",
  },
  async (event, { body }) => {
    // body 自动获得类型提示
    const { cid, content, name, mail, link, parent_id } = body;

    // ... 业务逻辑

    return createdComment;
  }
);
```

### 3. 前端调用示例

#### 使用 useApi composable

```typescript
// 带完整类型提示的 API 调用
const { data, pending, error, refresh } = await useApi("/search", "get", {
  query: { q: "关键词" }, // query 类型自动约束
});

// data.value 自动获得响应类型
console.log(data.value?.results); // 有完整类型提示
```

#### 快捷方法：useApiGet

```typescript
const { data, pending } = await useApiGet("/search", {
  q: "关键词",
});
```

#### 快捷方法：useApiPost

```typescript
const { data } = await useApiPost("/comments/index", {
  cid: 1,
  content: "评论内容",
  name: "用户名",
  mail: "test@example.com",
  csrfToken: "xxx",
});
```

#### 一次性请求（$api）

```typescript
// 类似 $fetch，但是有类型安全
const result = await $api("/search", "get", {
  query: { q: "关键词" },
});

// 快捷方式
const result = await $apiGet("/search", { q: "关键词" });
const result = await $apiPost("/comments/index", { cid: 1, content: "..." });
```

### 4. 高级配置

#### 显示成功/错误提示

```typescript
await useApi("/comments/index", "post", {
  body: { ... },
  showErrorToast: true, // 默认开启
  showSuccessToast: true,
  successMessage: "评论提交成功！",
});
```

#### 额外的 fetch 选项

```typescript
await useApi("/search", "get", {
  query: { q: "test" },
  fetchOptions: {
    onRequest({ request }) {
      console.log("请求发送中", request);
    },
    onResponse({ response }) {
      console.log("响应接收", response);
    },
  },
});
```

## Schema 定义规范

### 位置

所有 Schema 定义在 `server/api/schemas.ts` 文件中。

### 命名规范

- **请求查询 Schema**: `{Name}QuerySchema`
- **请求体 Schema**: `{Name}CreateSchema` / `{Name}UpdateSchema`
- **响应 Schema**: `{Name}ResponseSchema` / `{Name}ItemSchema`

### 示例

```typescript
// server/api/schemas.ts
import { z } from "zod";

// 查询参数 Schema
export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
});

// 响应 Schema
export const SearchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      snippet: z.string(),
    })
  ),
  total: z.number(),
  query: z.string(),
});
```

## 已类型化的 API

| 方法 | 路径 | 状态 |
|------|------|------|
| GET | `/search` | ✅ |
| GET | `/site` | ✅ |
| POST | `/comments/index` | ✅ |

## 如何添加新的类型化 API

### 步骤 1: 定义 Schema

在 `server/api/schemas.ts` 中添加你的 Schema：

```typescript
export const MyApiQuerySchema = z.object({
  id: z.coerce.number(),
});

export const MyApiResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});
```

### 步骤 2: 创建 API 处理器

```typescript
// server/api/my-api.get.ts
import { defineTypedApiHandler } from "#server/utils/typedApi";
import { MyApiQuerySchema, MyApiResponseSchema } from "./schemas";

export default defineTypedApiHandler(
  {
    query: MyApiQuerySchema,
    response: MyApiResponseSchema,
    description: "我的 API 描述",
  },
  async (event, { query }) => {
    // 业务逻辑...
    return responseData;
  }
);
```

### 步骤 3: 更新类型生成脚本

在 `scripts/generate-api-types.ts` 中，在类型生成部分添加新 API 的类型定义（参照现有的 `/search`、`/site`、`/comments/index` 的方式）：

```typescript
// 在 methodEntries.push(...) 之前添加
} else if (apiPath === "/my-api" && method === "get") {
  methodEntries.push(`    get: {
      query: { id: number };
      body: any;
      response: { id: number; name: string };
    };`);
```

### 步骤 4: 生成类型

```bash
bun api:types
```

### 步骤 5: 前端调用

```typescript
const { data } = await useApiGet("/my-api", { id: 123 });
```

## 类型定义说明

生成的类型定义文件位于 `shared/api-types.generated.ts`。

### 可用类型

```typescript
import type {
  ApiTypes,       // 完整的 API 类型映射
  ApiPath,        // 所有 API 路径联合类型
  ApiMethod,      // 特定路径的可用方法
  ApiResponse,    // 获取 API 响应类型
  ApiQuery,       // 获取 API 查询参数类型
  ApiBody,        // 获取 API 请求体类型
} from "~~/shared/api-types.generated";
```

### 使用示例

```typescript
// 获取特定 API 的响应类型
type SearchResponse = ApiResponse<"/search", "get">;

// 获取特定 API 的查询类型
type CommentCreateBody = ApiBody<"/comments/index", "post">;
```

## 工作原理

```
1. 开发者在 server/api/*.ts 中使用 defineTypedApiHandler 定义 API
2. 脚本扫描所有 API 文件，提取 Schema 引用
3. 生成 TypeScript 类型定义文件
4. 前端使用 useApi composable 获得完整类型提示
5. 后端运行时自动验证请求参数
```

## 错误处理

### 参数验证失败

当请求参数不符合 Schema 时，API 会自动返回 400 错误：

```json
{
  "statusCode": 400,
  "message": "查询参数验证失败",
  "data": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["q"],
      "message": "Required"
    }
  ]
}
```

## 注意事项

1. **不要手动修改** `shared/api-types.generated.ts`，此文件由脚本自动生成
2. Schema 名称必须以 `Schema` 结尾，否则脚本无法正确识别
3. 每次添加或修改 API Schema 后，请运行 `bun api:types` 重新生成类型
4. 开发环境下会自动验证响应类型，生产环境会跳过响应验证以提升性能

## 待改进

- [ ] 支持路径参数类型定义 (`/posts/:id` 中的 `id`)
- [ ] 支持 API 分组和版本管理
- [ ] 自动生成 API 文档
- [ ] 集成 E2E 测试框架，确保类型和实际响应一致
- [ ] 支持上传文件等复杂请求类型
