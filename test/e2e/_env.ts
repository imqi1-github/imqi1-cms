import { readFileSync } from "node:fs";

import { findRepoRoot } from "#test/helpers/find-repo-root";

// 解析根 .env(KEY=VALUE,去引号);无文件返回空表,用例按 skip 处理
export function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(`${findRepoRoot(import.meta.dirname)}/.env`, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // 无 .env:返回空,用例自行 skip
  }
  return out;
}
