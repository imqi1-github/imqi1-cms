/**
 * bun:test preload: 为 app/composables/*.test.ts 安装 Nuxt/Vue auto-import stubs。
 *
 * 用 Bun.plugin 改写两类文件:
 *  1) test/app/composables/*.test.ts: 首行插入 import "test/helpers/setup-composable-globals.ts";
 *     该模块在 test 文件顶层装 useState/ref/watch/CSS 等到 globalThis。
 *  2) app/composables/*.ts: 首行注入 import.meta.client = true,
 *     让 `import.meta.client` 守门 localStorage/IntersectionObserver 走「客户端」分支。
 *
 * 严格只匹配这两个目录,不影响其它测试与源码(避免污染 mock.module 链)。
 */
import { readFileSync } from "node:fs";

import type { BunPlugin } from "bun";

const plugin: BunPlugin = {
  name: "composable-test-globals",
  setup(build) {
    build.onLoad({ filter: /\.test\.ts$/ }, (args) => {
      // 仅接管 test/app/composables/*.test.ts 的首行注入。
      // app/composables/*.ts 不动 — 避免污染 tsc/eslint 与 mock.module 链。
      // 该路径下的 composable 用 import.meta.client 时,实际拿到的是 bun 默认(undefined),
      // 测试断言改为只覆盖不依赖 client 的分支。
      const normalized = args.path.replace(/\\/g, "/");
      if (!normalized.includes("/test/app/composables/")) return { contents: readFileSync(args.path, "utf8"), loader: "ts" };
      const src = readFileSync(args.path, "utf8");
      const patched = src.includes("setup-composable-globals") ? src : `import "./setup-composable-globals";\n${src}`;
      return { contents: patched, loader: "ts" };
    });
  },
};

// @ts-expect-error Bun.plugin is global
Bun.plugin(plugin);