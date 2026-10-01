/**
 * 从 import.meta.dirname 向上找仓库根(以 `scripts/init-db.sql` 为 marker)。
 * 取代写死 `..` 层数:目录结构变化 / 测试文件被嵌套调用时仍能定位正确根。
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function findRepoRoot(start: string): string {
  let cur = start;
  // 上限 10 层防无限循环(monorepo / 临时挂载异常)
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(cur, "scripts", "init-db.sql"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`[findRepoRoot] 从 ${start} 向上未找到 scripts/init-db.sql,目录结构异常`);
}
