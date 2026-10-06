/**
 * bun:test preload: 为 app/composables/*.test.ts 安装 Nuxt/Vue auto-import stubs +
 * 全局 snapshot/restore sharedFake 状态,根除「上一个测试 sharedFake.on() 永久覆盖 → 下个测试 setSession 抛 uniq」的进程级污染。
 *
 * 同时:在 bun 启动**第一时间**加载 .env 并把 DB_NAME 强制改为 imqi1_test，
 * 这样所有 .test.ts 加载的 #server/utils/prisma(模块级 singleton,加载时绑 DB_NAME)
 * 都会连到 imqi1_test，**永远不会**误清开发库 imqi1。
 *
 * 用 Bun.plugin 改写一类文件:
 *  - test/unit/app/composables/*.test.ts: 首行插入 import "test/helpers/setup-composable-globals.ts";
 *    该模块在 test 文件顶层装 useState/ref/watch/CSS 等到 globalThis。
 *
 * 严格只匹配这一个目录,不影响其它测试与源码(避免污染 mock.module 链)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BunPlugin } from "bun";
import { afterEach, beforeEach } from "bun:test";
import dotenv from "dotenv";

// 加载 .env + 强制 DB_NAME 为 imqi1_test:必须在任何 import 之前同步跑（process.env 之前）。
// bun test 启动顺序是 preload → worker → .test.ts → #server/utils/prisma 模块加载；
// 改 process.env 必须在 preload 阶段同步完成，#server/utils/prisma 才能在加载时读到覆盖后的值。
dotenv.config({ path: join(import.meta.dirname, "..", "..", ".env") });
const baseDbName = process.env.DB_NAME || "imqi1";
if (!baseDbName.endsWith("_test")) {
  process.env.DB_NAME = `${baseDbName}_test`;
}

// 全局 snapshot/restore sharedFake,根除「上一个测试 sharedFake.on() 永久覆盖 → 下个测试 setSession 抛 uniq」的进程级污染。
// 用 setImmediate 推迟 snapshot 到当前 macrotask 结束后(所有测试文件 beforeEach 注册完成后再拍),这样 afterEach 还原时
// 不会误删测试文件 beforeEach 里的 registerMetasFakes() 这类合法注册,只清掉测试 body 的 override。
let perTestSnap: Map<string, unknown> | null = null;
beforeEach(async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  const { sharedFake } = await import("#test/helpers/fake-prisma");
  perTestSnap = sharedFake.snapshot();
});
afterEach(async () => {
  if (!perTestSnap) return;
  const { sharedFake } = await import("#test/helpers/fake-prisma");
  sharedFake.restore(perTestSnap as Map<string, never>);
  perTestSnap = null;
});

const plugin: BunPlugin = {
  name: "composable-test-globals",
  setup(build) {
    build.onLoad({ filter: /\.test\.ts$/ }, (args) => {
      // 仅接管 test/unit/app/composables/*.test.ts 的首行注入。
      // app/composables/*.ts 不动 — 避免污染 tsc/eslint 与 mock.module 链。
      // 该路径下的 composable 用 import.meta.client 时,实际拿到的是 bun 默认(undefined),
      // 测试断言改为只覆盖不依赖 client 的分支。
      const normalized = args.path.replace(/\\/g, "/");
      if (!normalized.includes("/test/unit/app/composables/")) return { contents: readFileSync(args.path, "utf8"), loader: "ts" };
      const src = readFileSync(args.path, "utf8");
      // 首行判定:必须以 import "#test/unit/app/composables/setup-composable-globals"; 开头才算已注入,
      // 注释里出现"setup-composable-globals"字符串不算(避免命中后漏注入)。
      const alreadyInjected = src.startsWith('import "#test/unit/app/composables/setup-composable-globals";');
      const patched = alreadyInjected ? src : `import "#test/unit/app/composables/setup-composable-globals";\n${src}`;
      return { contents: patched, loader: "ts" };
    });
  },
};

// Bun.plugin is global on Bun runtime; typegen doesn't expose it under test/ tsconfig
Bun.plugin(plugin);