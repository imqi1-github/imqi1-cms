#!/usr/bin/env bun
// bun run 不解析 package.json 脚本里的 $@,只能追加参数 → 必须用脚本透传
// 无参数:全仓 lint(`bunx eslint .`);有参数:透传给 eslint
//
// 不加 --fix 跑纯校验(exit 0/1);用户显式传 --fix 走 autofix
// 用 `--max-warnings 0` 把 warn 也算 fail,与 CI 红绿语义一致
// ignore mini 子项目(它有自己的 eslint 配置 `mini/eslint.config.mjs` 与 `mini/.eslintignore`)
// 注意:monorepo 风格应改成 `turbo lint`/`nx run-many -t lint`;目前单包维持 bun 透传
const args = process.argv.slice(2);
const cmd = [
  "bunx",
  "eslint",
  ".",
  "--max-warnings=0",
];
if (args.length > 0) cmd.push(...args);
const proc = Bun.spawn({
  cmd,
  stdio: ["inherit", "inherit", "inherit"],
});
await proc.exited;
process.exit(proc.exitCode ?? 0);

export {};