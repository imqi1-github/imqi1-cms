---
name: auth-redirect-fullpath-not-path
description: "路由中间件做\"登录后回跳\"重定向时用 to.path 会丢 query(cid 等参数没了),登录后回错页/编辑器空载;用 to.fullPath 或 navigateTo 对象式 query"
metadata: 
  node_type: memory
  type: project
  originSessionId: 629fe2c3-bb89-4d73-8fd1-8f2546ff16e0
---

`app/middleware/auth.global.ts` 里 5 处 `return navigateTo("/login?to=" + encodeURIComponent(to.X))`,X 必须是 **`to.fullPath`** 不能是 `to.path`——`RouteLocationNormalized.path` 只含路径**不含 query**,`fullPath` 才是路径+query+hash。

**症状与原因的解耦(排查关键)**:访问 `/admin/contents/edit?cid=1008` 时 session 过期 → 中间件用 `to.path`=`/admin/contents/edit`(cid 丢了)重定向到 login → 登录后 `navigateTo(route.query.to)` 回到**无 cid 的新建文章页 → 编辑器空载**。症状("登录后编辑器空白")完全不指向"重定向中间件丢了 query",极易误判成编辑器/fetchContent 的 bug。先看 URL bar 的 cid 在不在,再回溯 login 的 `to` 参数。

**别用字符串拼接 `"/login?to="+encodeURIComponent(fullPath)`**:`navigateTo` 会把字符串经 `ufo` parse→re-serialize 一遍,`encodeURIComponent` 的编码被吃掉,Location 头变成 `/login?to=/admin/contents/edit?cid=1008`(第二个 `?` 裸着)。这虽然 RFC3986 合法(query 内允许未编码 `?`,只禁 `#`,且 fullPath 不带裸 `#`),标准 `URL`/Vue Router 解析也能还原 cid,但误导且脆弱。用对象式 `navigateTo({ path:"/login", query:{ to: to.fullPath } })`,让 ufo 处理序列化(它对 query 值里的 `/` `?` `=` 同样不编码,输出相同但语义干净)。

`app/pages/login.vue` 的 `redirectTo` 防开放重定向校验(`to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\')`)对含 query 的 fullPath 同样放行,无需改。相关:[[auth-session-security-invariants]]。
