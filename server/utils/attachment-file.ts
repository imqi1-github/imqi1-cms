import * as fs from "fs/promises";
import * as path from "path";

import { deleteFromCOS } from "#server/utils/cos";

interface AttachmentFileTarget {
  storage: string;
  url: string;
}

/**
 * 本地上传文件的静态资源根目录（uploads 的上级 public）。
 *
 * 生产环境 Nitro 从 .output/public 提供静态文件，且 cwd=/app 下不存在裸 public 目录，
 * 因此写入/读取都必须落在 .output/public，才能与静态服务、compose 具名卷一致；
 * 开发环境（bun run dev）cwd 为项目根，静态文件从 public 提供。
 */
export function getPublicDir(): string {
  return process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".output", "public")
    : path.join(process.cwd(), "public");
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

  return path.join(getPublicDir(), normalized.replace(/^\/+/, ""));
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
