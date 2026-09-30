# E2E 用户操作用例踩坑(comment/link/search)

## 前台交互
- 评论框是 `<EmojiRichInput>`(contenteditable),**不是 textarea**,定位用 `getByRole("textbox", { name: /评论内容/ })`
- 访客评论必填图形验证码(前端强制,机器不可读)→ 用例走**登录态**:`loginAdmin(page.request)` 后浏览器 context 继承 session cookie 免验证码
- **单端登录互踢**:一用例内多次登录(如 ensureArticle 用 request fixture、清理用另一个)会互踢致清理 401 → 全用例只准一次登录,统一用 `page.request`
- 反垃圾:页面加载 **5s 内提交被拒**("操作太快"),提交前 `waitForTimeout(5200)`
- toast(vue-sonner) **4s 自动消失**;且真文案是**服务端返回的 message**(如友链"申请友链成功,等待管理员审核"),前端 `data.message || "..."` 的 fallback 是死代码——断言文本必须抄 server 端
- 友链双路径:后台开 `linkAutoApprove` 才有 needRetry→「仍然提交」;未开启直接入库待审核 → `expect(toast.or(forceBtn)).toBeVisible()` **竞速等待**,不能串行等(串行白等期间 toast 已消失)
- 搜索页页内计数文案是 `找到 N 篇相关文章`(106 行的 `"kw" 的搜索结果` 只是 document.title,页内不渲染);URL 直达 /search?q= 即触发

## 数据自给自足(ensureArticle/cleanupArticle in test/e2e/_admin.ts)
- dev 库可能零文章/零分类:用例前置 ensureArticle(建分类→建文→挂关系),finally cleanupArticle
- 坑:admin categories 列表**无 type 字段**;POST /api/admin/contents 返回 `{success,data:{cid}}` **不含 slug**;分类删除有"至少保留一个分类"400(cleanup 的 catch 已吞,零分类库跑完会剩一个改名残留)
- admin 响应形状不统一(contents 包 data、categories/links 顶层数组)→ findIdBy 递归容错,别假设包裹层
- **清理必须无条件执行**(finally 里不做 submitted 门控):断言失败时数据可能已入库,门控会留脏;marker 前缀精确匹配,找不到自然跳过
- 反垃圾/验证码/单端登录三坑叠加 → 用户操作用例的通用骨架:单次登录 → goto → 等表单 → 等反垃圾窗 → 填 → 提交 → 断言 toast → finally 无条件清 marker

## 第二批新增(reply/login/theme/message/搜索输入即搜)
- **评论间隔是双层**:前端 localStorage(可伪造跳过)+ **服务端按 IP+DB create_time 60s 429**(POST 仍返 HTTP 200,业务 code:429)→ 嵌套回复用例只能真等 61s;诊断手法=page.on("response") 打 POST /api/comments 的 body(JSON.stringify 后 code/message 一目了然)
- 回复按钮无可达名(v-tooltip 不产 aria)→ `button` filter `has: locator("[class*='reply-fill']")`(iconify class 是 `ri--reply-fill`,子串匹配要用 reply-fill 不能 ri-reply-fill)
- 回复框与主框共存 → textbox/button 取 `.last()`;父项容器 `li, article` filter hasText 取 `.first()`(最外层含按钮与嵌套回复)
- 留言板 contentId 来自后台设置,未配置时页面无输入框 → waitFor 5s 后 skip
- 订阅页(subscribes)是只读聚合无游客提交表单,不适用写用例
- 登录 UI:#username/#password + "登录"按钮 → waitForURL(/admin/)

## 第三批:后台 E2E(admin/)
- **hydration 竞态**:goto 后立即 click 会撞"事件未绑上 click 被吞"→ 用 `expect(async () => { click; expect(结果).toBeVisible({timeout:2000}) }).toPass({timeout:20000})` 重试模式(MCP 单步操作正常但测试挂,就是它)
- edit 页 #title/#slug/分类在「文章设置」TabsContent 里(默认 content tab 隐藏,offsetParent null)→ 先 getByRole("tab").click 再填;正文编辑区 .ProseMirror 在默认 tab
- shadcn/reka 的 Checkbox 是 **button[role=checkbox] 不是 input[type=checkbox]**;批量删除按钮出现依赖 selectedIds>0
- admin 响应**HTTP 200 包业务错误**(code:429/4xx)→ 断言 body.code 不是断言 status
- 服务端 message 系 toast:批量删评论"成功删除 N 条评论"(单删才是"评论已删除")——断言前 grep server 端 message
- 同一文本出现多处+隐藏副本(tab 面板各渲染一份)→ getByText 会 strict violation,first() 又可能命中 hidden → 改用计数文案/服务端确认类锚点
- contents delete **不级联删评论**(孤儿评论挂在已删 cid 下)——失败轮残留的来源;cleanup 时评论要单独删
- aria-label 补齐:CommentItem 回复按钮 ×2、AdminLayout 退出登录(v-tooltip 不产可达名,屏幕阅读器不可用)→ 顺带让测试可用 getByRole(name) 定位

## 凭据不符处理(2026-10-01 用户定稿)
- **不改开发库**:loginAdmin 返回 boolean(成功/凭据不符|2FA),调用方 `test.skip(!(await loginAdmin(...)), ADMIN_SKIP_MSG)`;ADMIN_SKIP_MSG 提示跑 bun run reset:password
- **自适应验证码坑**:login 失败累计触发 captchaRequired(login-rate-limit 15min 窗口,dev 无 Redis 存内存),之后所有登录 400"请输入正确的验证码"→ E2E 全 skip;**dev 重启 server 即清零**(内存回落);UI 登录用例前置 loginAdmin 同样被跳
- scripts/test.ts 末尾固定输出种子账号警告
