# import 一律走别名,禁写相对路径

**用户强原则（2026-09-27）**：全仓（`test/`、`app/`、`server/`、`shared/`）的 import 一律用别名，不写 `from "../foo"` / `from "../../server/x"`。

别名表：`#shared`（跨 bundle 共享）、`#server`（nitro）、`#test`（test/ 目录专属，见 `test/tsconfig.json`）、`~`/`@`（app/）、`~~`/`@@`（仓库根）。paths 配在根 `tsconfig.json` + `test/tsconfig.json`（Nuxt 同名别名在 `.nuxt/tsconfig.*`，bun 不读，故根 tsconfig 另配一份）。

**Why**：相对路径绕过别名解析，文件移动/重命名时要批量改，且 IDE rename、knip、eslint import 规则对别名更准。

**坑（2026-09-27 全仓清理时踩到）**:

- **扫相对 import 必须两种引号都匹配**：只写 `from "\.\./` 会漏掉单引号写法（aplayer lib 移植风格全是 `'../utils'`，第一轮就漏了 4 处）。用 `grep -rnE "(from|import\(|require\()\s*['\"]\.\./"`。
- **`~/../server/x` 是伪装成别名的相对路径**——`~` 解析到 `app/`，`~/..` 退回仓库根。grep 相对路径时要把 `~/\.\./` 一起搜；全仓 22 处已改 `#server/x`。
- **两处必须保留 `../`，都已在文件内加注释**（别名在那条加载路径上不解析，改了就挂，实测确认）：
  - `shared/redis-config.ts` 的 `../site.config`——被 `nuxt.config.ts` 静态 import，经 jiti/c12 加载，改 `~~/site.config` 会让 `bunx nuxi typecheck` / build 在 `require.resolve` 阶段直接失败。
  - `scripts/update-sw-cdn.ts` 的 `../site.config`——`scripts/` 有自己的 `package.json`，bun 不向上找根 tsconfig，`~~` 从 `scripts/` 内解析实测失败（`bun -e` 从仓库根跑却成功，别被这个假阳性骗到；要验就在 `scripts/` 里建临时文件跑）。
- **`test/helpers/bun-preload.ts` 注入的 `import "..."` 会被拼进被测测试文件源码**，解析基准是被测文件所在目录、不是 bun-preload.ts 目录。别名在注入上下文里可用，但必须指向真实存在的文件：`#test/app/composables/setup-composable-globals`（桩文件在 `test/app/composables/` 下，不在 `test/helpers/`）。
- 测试里读源码用**根相对**路径 `readFileSync("app/composables/x.ts")`（cwd = 项目根，与其它读源码的测试一致），不要 `resolve(__dirname, "../../..")`。
- **搜 `../..` 会命中一堆非 import 的假阳性**，都是预期保留的：`session-store*.test.ts` / `attachment-file.test.ts` / `uploads.test.ts`（路径穿越**攻击载荷**）、`server/utils/session-store.ts` 与 `scripts/file-server.ts` 的防御注释、`SECURITY.md`、`.claude/memory/*`。别再动它们。`./` 同目录 import（aplayer lib、`app/components/ui/*` 桶文件）不在规则范围内。
- **改完必跑三件套**：`bunx eslint .`（import/order 会因分组变化报错，改动后可 `bunx eslint --fix <dir>`）+ `bunx nuxi typecheck`（与改动前 error 数逐条对比，仓库存量 844 条不在本轮范围）+ 受影响测试文件。

相关：[[bun-mock-module-leak-zz-late-layout]]（同文件里记了 `test/` 别名与 composable 桩的注入机制）。
