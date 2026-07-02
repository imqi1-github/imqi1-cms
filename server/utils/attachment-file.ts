import * as fs from "fs/promises";
import * as path from "path";

import { deleteFromCOS } from "#server/utils/cos";

interface AttachmentFileTarget {
  storage: string;
  url: string;
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

  return path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
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
