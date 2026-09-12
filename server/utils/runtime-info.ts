import { promises as fs } from "node:fs";

/**
 * 读取构建期烘焙的 buildHash（runtimeConfig.buildHash，非 public）。
 *
 * nuxt.config.ts 的 genBuildHash() 在每次 build 模块加载时生成一次并烘焙进产物；
 * 开发环境返回 "开发版"。函数形式与 detectDocker 对称,便于未来按需扩展
 * （如环境变量覆盖、CDN 注入等）。
 */
export function getBuildHash(): string {
  return useRuntimeConfig().buildHash ?? "";
}

/**
 * 检测当前进程是否运行在容器内（Docker / containerd / K8s / Podman）。
 *
 * 判定策略（OR 关系）：
 *   1. `/.dockerenv` 文件存在 —— Docker 默认创建,containerd 派生运行时也常有
 *   2. `/proc/1/cgroup` 任一行命中 `docker|containerd|kubepods|podman` 关键字
 *
 * 非 Linux / 不可读 → false；任何异常均兜底为 false（不抛错,避免后台系统信息接口 500）。
 *
 * 注意：在容器内 PID 1 通常是本进程或 init;容器外读到的是宿主 init,几乎不会命中关键字。
 * 容器内读 `/proc/1/cgroup` 读到的就是容器自己的 cgroup 路径,能稳定命中。
 */
export async function detectDocker(): Promise<boolean> {
  try {
    await fs.access("/.dockerenv");
    return true;
  } catch {
    // 非容器或权限受限,继续尝试 cgroup
  }

  try {
    const cgroup = await fs.readFile("/proc/1/cgroup", "utf8");
    return /\b(docker|containerd|kubepods|podman)\b/i.test(cgroup);
  } catch {
    // 非 Linux / 不存在 / 不可读 → 兜底非容器
    return false;
  }
}