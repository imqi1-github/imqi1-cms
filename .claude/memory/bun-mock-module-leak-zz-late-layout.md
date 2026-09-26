# bun mock.module 全进程泄漏 → 集成测试放 test/zz-late/

`bun:test` 的 `mock.module` 一旦注册就**整进程生效且无法撤销**（`mock.restore()` 不还原模块 mock，实测确认），后加载文件的注册会覆盖先加载的，但先注册的 mock 会污染之后**首次 import** 真实模块的所有文件。bun 按路径字典序跑文件（api < middleware < plugins < routes < utils < shared）。

**后果**：在 `test/server/api/` 里 `mock.module("#server/utils/cos"|"safe-fetch"|"rss"|"mail")` 写接口测试，会让 `test/server/utils/` 下测**真实模块**的测试（cos.test、safe-fetch.test、mail.test、rss 相关）拿到假件而全挂（2026-09-26 实测 45 个失败全源于此）。

**约定**：需要 mock server 工具模块的「集成型」测试文件统一放 **`test/zz-late/api/`**（字典序在所有真实模块测试之后、shared 纯函数测试之前，shared 不受影响）。现有 9 个文件覆盖 41 个此前未测的公开/admin 端点（comments.post 全矩阵、links 提交链、附件上传链、data export/import、footprint/blog-network 等）。

相关坑：
- `test/types/nitro-globals.d.ts`（test/tsconfig include 的按需全局声明处）：测试 import 链把用 nitro 专属全局的 server 文件拖进 test 编译图时会报 Cannot find name——缺什么补什么（本次补了 `sendRedirect`/`readFormData`，并给 `useRuntimeConfig` 加了 `amapUseServerProxy?`）。
- sharedFake（`#test/helpers/fake-prisma`）注册按「最后注册者胜」：同模型同方法只能有一份 handler，跨 handler 复用时在 handler 内按 `where` 形态分流（见 public-map 的 comments.findMany、public-home 的 contents.findMany），别注册两份互相覆盖。
- `test/zz-late` 内文件之间也是字典序（admin < attachments < comments-post < links-submit < public-*），后文件注册会覆盖前文件，各文件自足声明所需假件、不要依赖别的测试文件留下的注册。
