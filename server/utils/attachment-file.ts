import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

import { deleteFromCOS } from "#server/utils/cos";
import type { AttachmentFileTarget } from "#server/types/utils/attachment-file";

/**
 * 本地上传文件的静态资源根目录（uploads 的上级 public）。
 *
 * 生产环境 Nitro 从 .output/public 提供静态文件，因此写入/读取都必须落在 .output/public，
 * 才能与静态服务、compose 具名卷一致。但运行方式不同，process.cwd() 也不同：
 *   - `node .output/server/index.mjs`（仓库根启动）→ cwd = 仓库根
 *   - `nuxi preview` → cwd = .output（旧实现会拼出 .output/.output/public，导致上传路径错误 + 前端 404）
 *   - Docker（WORKDIR /app）→ cwd = /app
 * 所以不能依赖 cwd 拼 ".output"，而是以本模块 URL 为锚点向上寻找 .output 目录。
 * 开发环境（bun run dev）cwd 为项目根，静态文件从 public 提供。
 */
export function getPublicDir(): string {
  if (process.env.NODE_ENV !== "production") {
    return path.join(process.cwd(), "public");
  }

  const candidates: string[] = [];
  try {
    // Nitro 会把 import.meta.url 换成运行时真实的服务端文件 URL；
    // 从本模块所在目录向上查找名为 .output 的祖先目录，命中即用 <.output>/public。
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      if (path.basename(dir) === ".output") {
        candidates.push(path.join(dir, "public"));
        break;
      }
      candidates.push(path.join(dir, "public"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // 顶层占位（file:///_entry.js），忽略，走 cwd 兜底
  }

  candidates.push(
    path.join(process.cwd(), ".output", "public"),
    path.join(process.cwd(), "public"),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates.find(Boolean) ?? path.join(process.cwd(), "public");
}

/**
 * 本地上传文件的根目录（默认 <public>/uploads）。
 *
 * 可通过环境变量 UPLOADS_DIR 覆盖为任意目录：
 *   - 绝对路径直接使用（可指向 .output/public 之外的独立存储盘）；
 *   - 相对路径相对于 process.cwd() 解析。
 * 当 UPLOADS_DIR 指向 public 之外时，Nitro 静态服务无法命中，读取由
 * server/routes/uploads/[...path].get.ts 兜底提供，避免前端 404。
 */
export function getUploadsDir(): string {
  const override = process.env.UPLOADS_DIR?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(getPublicDir(), "uploads");
}

const getLocalUploadPath = (url: string) => {
  const cleanUrl = url.trim().split("#")[0]?.split("?")[0] ?? url.trim();
  let pathname = cleanUrl;

  try {
    pathname = new URL(cleanUrl).pathname;
  } catch {
    // 本地相对路径直接使用
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // 解码失败时继续使用
  }

  const normalized = pathname.replace(/\\/g, "/");
  if (!normalized.startsWith("/uploads/")) return null;
  if (normalized.split("/").some(segment => segment === "..")) return null;

  // 去掉前导的 "/uploads/"，其余相对路径落到实际的上传根目录（支持 UPLOADS_DIR 覆盖）。
  const relative = normalized.replace(/^\/uploads\/+/, "");
  return path.join(getUploadsDir(), relative);
};

export async function deleteAttachmentFile(attachment: AttachmentFileTarget) {
  if (attachment.storage === "cos") {
    const result = await deleteFromCOS(attachment.url);
    if (!result.success) {
      console.error(result.error);
    }
    return;
  }

  const filePath = getLocalUploadPath(attachment.url);
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code !== "ENOENT") {
      console.error(error);
    }
  }
}
