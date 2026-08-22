---
name: prisma-relation-key-rename-trap
description: "批量重命名标识符时 Prisma 查询的关系过滤键(content vs contents)会被误改且 vue-tsc 抓不到,只在运行时 500;必须实跑 API"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2eb21d14-ef03-4a8a-bdae-5712db9b693b
---

posts→contents 重命名时,`post`→`content` 那趟把 Prisma **关系过滤键**也误改了:`contentrelations`/`contentattachments`/`contenttravels` 这些 join 模型上,指向 contents 的关系字段是**单数** `content`(见 [[api-types-nitro-internal]] 同源的 schema 关系命名),但 where/orderBy 里被错写成 `contents:`。表现为分类/标签页 `prisma.contentrelations.count()` 运行时 500:`Unknown argument 'contents'. Did you mean 'content'?`。已修:category/tag 的 `[slug]/contents.get.ts` 里 count 的 where。

**Why:** Prisma 的 `where`/`orderBy` input 类型宽松,多余的 relation key 不触发 TS 编译错误——`vue-tsc --build` 全绿也可能有这个 bug。它只在运行时炸。区分:`content:`/`contents:` 作为**响应体键**(return 的对象)是安全的、随便改;作为 **prisma 查询里的关系键**必须匹配 schema 字段名(join 模型上是单数 content)。

**How to apply:** 任何跨文件批量改标识符后,除了 `bunx vue-tsc --build --force` + `bunx eslint .` + `bun run build`,**必须启 dev server 逐个打 API**(`curl -o /dev/null -w "%{http_code}"`)——尤其是走 contentrelations/join 模型的端点(category/tag/mini/footprint/travels)。校验时 grep `\bcontents:\s*\{` in server/,逐个确认是响应键还是 prisma 关系键。
