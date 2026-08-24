---
name: lint-typecheck-no-root-script
description: "根 package.json 无 lint/type-check 脚本(只在 mini/),验证 Nuxt app 要直接 bunx;类型校验必须 nuxi typecheck——根 vue-tsc 不走 .nuxt/tsconfig.json 会漏报(schema.nodes undefined/组件 emit/storage 断言等查不到)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6d511b35-e9ec-420e-9d46-386191215c0b
---

根 `package.json`(Nuxt app)只有 `build`/`dev`/`generate`/`preview`/`prisma:*` 等脚本,**没有 `lint` 和 `type-check`**。这两个脚本只存在于 `mini/package.json`(uni 子项目,`eslint . --fix` 与 `vue-tsc --noEmit -p tsconfig.json`)。

**Why:** 计划/记忆里写 "bun run lint / bun run type-check" 时默认指根项目,但根没这俩脚本——在根跑 `bun run lint` 会 "Script not found"。更隐蔽的坑:bash CWD 可能从上一会话残留在 `mini/`(本会话就如此),此时 `bun run lint`/`bun run type-check` 会跑 **mini** 的同名脚本,看似通过实则只检查了小程序、根本没碰 `app/` 的改动。

**How to apply:** 验证 Nuxt(app/)改动前先 `pwd` 确认在根 `/a/imqi1-cms`;在根直接 `bunx eslint .`(根有 eslint.config.mjs)。**类型校验用 `bunx nuxi typecheck`**——它基于 `nuxt prepare` 生成的 `.nuxt/tsconfig.json`(含 #imports、组件 props/emit、严格索引访问),才是 Nuxt 项目的类型守门。**别用 `bunx vue-tsc -p tsconfig.json`**:根 tsconfig.json 不引用 .nuxt,会漏报(实测 PM `schema.nodes.xxx` 返回 `NodeType|undefined` 的非空检查、`@update:model-value` emit payload 类型、`editor.storage as {...}` 断言重叠等都查不到,误判 0 错误——本会话踩过)。构建用 `bun run build`(根有,= `nuxt build` + pre/post 钩子做 hash/数据拷贝/CDN;只要验编译可用 `bunx nuxt build` 跳过 postbuild 的网络步骤)。验证 mini 用 `cd mini && bun run lint`(mini 是 uni-app 不是 Nuxt,自己的 vue-tsc 仍适用)。
