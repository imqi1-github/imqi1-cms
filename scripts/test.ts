#!/usr/bin/env bun
// bun run 不解析 package.json 脚本里的 $@,只能追加参数 → 必须用脚本透传
// 无参数:限定 test/;有参数:透传,避免和 test/ 双 pattern 跑两份
const args = process.argv.slice(2);
const pattern = args.length > 0 ? [] : ["test/"];
// --isolate:每个 .test.ts 独立 globalThis。bun 默认共享 global,跨文件的 mock.module /
// Object.assign(globalThis, ...) / 模块顶层全局变量会污染后续测试 → "请先登录" /
// "document is not defined" / sharedFake.on 永久覆盖等大批失败源。开启 isolate 后
// 每个文件 fresh global,跨文件污染被切断。
// 串行执行:max-concurrency=1 根除并发对进程级状态(env/共享假件/globalThis 桩)的互踩;
// 用户显式传 --max-concurrency 可覆盖(bun 取最后一个)
// preload 通过 bunfig.toml [test] 段注入,见 bunfig.toml
// --path-ignore-patterns 排除 git submodule(mini 是独立子项目,有自己的 bunfig +
// globalThis.uni 桩,与主仓库 globalThis 同 process 会冲突 → 主仓库跑 mini 测试必挂;
// mini 内 `bun run test` 单独跑)
// test/e2e 是 Playwright E2E(走 bun run test:e2e,bun test 会误收 *.spec.ts);
// test/node_modules 是 test/package.json 独立依赖(happy-dom/@playwright/test)
const cmd = [
  "bun",
  "test",
  "--isolate",
  "--max-concurrency=1",
  "--path-ignore-patterns",
  "{mini,node_modules,test/e2e,test/node_modules}/**",
  ...pattern,
  ...args,
];
const proc = Bun.spawn({
  cmd,
  stdio: ["inherit", "inherit", "inherit"],
});
await proc.exited;
// E2E(bun run test:e2e)凭据提示:种子账号与库不符时相关用例自动跳过而非失败
console.warn("⚠️  提醒: E2E 测试(test:e2e)使用种子账号 admin/123456 — 若与数据库凭据不符,相关用例会自动跳过;可运行 bun run reset:password 重置");
process.exit(proc.exitCode ?? 0);

export {};
