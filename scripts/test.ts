#!/usr/bin/env bun
// bun run 不解析 package.json 脚本里的 $@,只能追加参数 → 必须用脚本透传
// 无参数:限定 test/;有参数:透传,避免和 test/ 双 pattern 跑两份
const args = process.argv.slice(2);
const pattern = args.length > 0 ? [] : ["test/"];
// 串行执行:max-concurrency=1 根除并发对进程级状态(env/共享假件/globalThis 桩)的互踩;
// 用户显式传 --max-concurrency 可覆盖(bun 取最后一个)
// preload 通过 bunfig.toml [test] 段注入,见 bunfig.toml
const cmd = ["bun", "test", "--max-concurrency=1", ...pattern, ...args];
const proc = Bun.spawn({
  cmd,
  stdio: ["inherit", "inherit", "inherit"],
});
await proc.exited;
process.exit(proc.exitCode ?? 0);

export {};
