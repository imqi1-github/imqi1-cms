---
name: admin-write-catch-swallow-pattern
description: admin 写接口的 catch 块不能无条件抛 500——要原样抛带 statusCode 的错误 + P2025→404
metadata: 
  node_type: memory
  type: project
  originSessionId: 0be5d550-b196-4eed-a665-fd0ecdc9b610
---

admin 写接口(`/api/admin/*` 的 POST/PUT/PATCH/DELETE)的 `try/catch` 里常见反模式:catch 无条件 `throw createError({statusCode:500})`,把本该是 400/404 的错误盖成 500。审查 links.vue、subscribes.vue 都命中,后续 changelogs/travels/attachments/settings/users/pages/index 大概率同类。

**2026-07-19 生产后台全模块运行时复验**:逐个 DELETE/PUT 不存在 id,实测 changelogs/travels/attachments/subscribes/comments/contents/tags/categories **早已全部干净**(都有 P2025→404 或 findUnique 预检),唯一残留是 `server/api/admin/links/[id].delete.ts`(catch 无条件 500,DELETE 不存在 id 实测 500)——当日已补 P2025→404 修复(dev HMR 后实测返 404「链接不存在」)。即此范式现已全后台覆盖,**别再假定「同类」**——改前先 curl 一遍。

两类被吞错误:
1. **validateXxxData 的 400**(字段超长等)——它在 try 内调用,`createError({statusCode:400})` 被 catch 吞成 500。
2. **Prisma P2025 not-found**——直接 `update`/`delete` 不存在的 id(没 findUnique 预检)→ P2025 → 500(应 404)。P2025 是 Prisma 原生错误,**不带 statusCode**,所以「statusCode 守卫」救不了它,要单独 `error.code === "P2025"` 判。

正确 catch 范式(参考 `server/api/admin/tags/[id].put.ts:57` 已是好的,`server/api/attachments/upload.post.ts:282` 是 statusCode 守卫的源):
```js
} catch (error) {
  console.error(error);
  // 已带 statusCode 的错误（validateXxxData 的 400 等）原样抛
  if (error && typeof error === "object" && "statusCode" in error) throw error;
  // Prisma not-found
  if (error instanceof Error && "code" in error && error.code === "P2025") {
    throw createError({ statusCode: 404, message: "xxx 不存在" });
  }
  throw createError({ statusCode: 500, message: "xxx 失败" });
}
```

注意:CSRF/getUser 校验本就在 try 外(见 [[admin-write-api-csrf-required]]),catch 守卫是补 try 内部的 400/404。实际 UX 影响有限——前端 catch 后多弹硬编码 toast,看不到后端具体信息;但状态码语义必须对。验证用 chrome-devtools(dev 在跑时):超长字段→400、不存在 id→404,都在写库前抛错,零副作用。
