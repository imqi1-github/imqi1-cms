# Playwright webServer 杀自启 dev → .nuxt/nuxt.lock 残留挡死下次 dev

## 现象
`bun run test:e2e` 的 playwright webServer 自启 `bun run dev` 跑完测试后被 kill，`.nuxt/nuxt.lock`（记录 pid）残留；下次起 dev 直接 exit 1（citty runMain 抛错），报错只有堆栈无原因提示。

## 坑点
1. Nuxt dev lock 检测靠 pid 存活判断，**Windows pid 复用会误判存活**（实测残留 pid 26056 已被 svchost 占用 → 误判"dev 已在跑"）。
2. playwright 对**自启**的 webServer 测完必杀（`reuseExistingServer: true` 只保护外部已起的服务），所以只要走自启路径就会产生残留。

## 处理
- 兜底：`rm .nuxt/nuxt.lock` 后重起 dev。
- 规避（现行约定）：**手动常驻 dev（PORT=3001）+ playwright 复用**，别依赖 webServer 自启。config 里 webServer 保留（无服务时兜底自启），但跑完记得清 lock。

## E2E 框架要点（test/e2e/）
- 依赖隔离：`test/package.json`（@playwright/test + bun-types + happy-dom，`bun run test:e2e:install` 独立装，模式同 scripts/package.json）。
- 浏览器镜像：`e2e:browsers` 脚本内置 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`；**chromium v1243 的 win64 包实际放在 `builds/cft/153.x/win64/` 路径**（不是 builds/chromium/1243/，那里只有 linux 包，按 1243 路径猜会误判镜像没货），npmmirror 实测 cft/ffmpeg/winldd 全 200。
- `scripts/test.ts` 的 `--path-ignore-patterns` 必须含 `test/e2e`（bun test 默认收集 `*.spec.ts`，会误跑 playwright spec）和 `test/node_modules`。
- dev 绑 `[::1]`，webServer url 用 `http://localhost:3001` 可达；`/agreement` 内容存 CMS，本地 dev DB 未建 → 404 是合法状态（spec 已按 200/404 双合法断言）。
