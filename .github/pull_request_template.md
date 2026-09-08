## 变更内容
<!-- 本次 PR 做了什么？为什么？请用一句到几句话概述。-->

## 自测清单
<!-- 项目强校验，改动后必跑（在仓库根目录）：bunx eslint . 、bunx nuxi typecheck 、bun run tailwindcss:lint -->
- [ ] `bunx eslint .` 通过
- [ ] `bunx nuxi typecheck` 通过
- [ ] `bun run tailwindcss:lint` 通过
- [ ] 若改动 API / DB，已用 `curl` 或浏览器实测对应接口

## 涉及敏感约定
<!-- 判定是否触碰以下硬性约定；若无请保留"无" -->
- 公开接口是否带 `select`/逐字段白名单（禁 `...row`）？ —— 无 / 是
- Admin 写接口是否带 `validateCsrfToken`？ —— 无 / 是
- 是否改了数据库 schema（禁用 `migrate dev/reset`）？ —— 是，走：db execute / 幂等 tsx / 无
- 类型是否放在独立文件（`app/types/apis` / `server/types/apis`），未内联？ —— 是 / 无

## 截图 / 行为变化
<!-- 若涉及 UI，请附前后对比或执行效果。-->

## 关闭的 issue
<!-- 关联或关闭的问题：Fixes #123 -->
