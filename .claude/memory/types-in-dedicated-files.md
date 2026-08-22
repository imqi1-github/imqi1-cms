---
name: types-in-dedicated-files
description: 类型必须放独立类型文件，不在 .ts/.vue 内内联定义 interface/type
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f5750241-e31b-4be9-80cd-91471cbd106b
---

类型定义必须放在专门的类型文件里，不得在 `.ts`/`.vue` 业务文件内内联声明 `interface`/`type`（含 `<script setup>` 顶部、handler 文件顶部）。响应数据结构尤其要抽到类型文件再 `import type`。

**Why:** 用户明确要求统一管理类型，避免类型散落在业务文件里难以复用与维护。

**How to apply:**
- 服务端类型放 `server/types/apis/<域>.d.ts`，用 `#server/types/apis/<域>` 导入（如 `import type { ArchiveGroup } from "#server/types/apis/archiving"`）。
- 前端类型放 `app/types/apis/...`，用 `~/types/apis/...` 导入。
- 新增任何接口/数据结构时，先建或找对应类型文件，再 import；不要在 .ts/.vue 里 `interface X {...}` 然后本地用。
- 已有内联类型遇到时顺手外迁。相关约定见 [[eslint-adopted-strict]]、[[api-types-nitro-internal]]。
