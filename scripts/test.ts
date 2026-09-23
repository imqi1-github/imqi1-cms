#!/usr/bin/env bun
// bun run 不解析 package.json 脚本里的 $@,只能追加参数 → 必须用脚本透传
// 无参数:限定 test/;有参数:透传,避免和 test/ 双 pattern 跑两份
const args = process.argv.slice(2);
const pattern = args.length > 0 ? [] : ["test/"];
const cmd = ["bun", "test", ...pattern, ...args];
const proc = Bun.spawn({
  cmd,
  stdio: ["inherit", "inherit", "inherit"],
});
await proc.exited;
process.exit(proc.exitCode ?? 0);
