import { createReadStream } from "fs";
import { stat } from "fs/promises";
import * as path from "path";

import { getUploadsDir } from "#server/utils/attachment-file";

// 上传文件为固定的图片/视频集合，直接维护后缀→Content-Type 映射，
// 避免引入 mime 包在 Nitro 打包下的 ESM/CJS 差异。
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/**
 * 本地上传文件读取兜底路由。
 *
 * 默认上传目录在 .output/public/uploads 时由 Nitro 静态服务直接命中，
 * 一般不会走到这里；当通过 UPLOADS_DIR 把存储目录指向 public 之外时，
 * 静态服务无法命中，则由本路由从真实上传目录读取，避免前端 404。
 * 配置了 CDN 时，routeRules 的 301 重定向会先于本路由生效。
 */
export default defineEventHandler(async event => {
  const segments = getRouterParam(event, "path") ?? "";
  const decoded = decodeURIComponent(segments);

  // 目录穿越防护
  const normalized = decoded.replace(/\\/g, "/");
  if (!normalized || normalized.split("/").some(seg => seg === ".." || seg === "")) {
    throw createError({ statusCode: 400, message: "非法路径" });
  }

  const uploadsDir = getUploadsDir();
  const filePath = path.join(uploadsDir, normalized);

  // 二次校验：解析后的绝对路径必须仍在上传目录内
  const resolvedRoot = path.resolve(uploadsDir);
  const resolvedFile = path.resolve(filePath);
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(resolvedRoot + path.sep)) {
    throw createError({ statusCode: 400, message: "非法路径" });
  }

  let fileStat;
  try {
    fileStat = await stat(resolvedFile);
  } catch {
    throw createError({ statusCode: 404, message: "文件不存在" });
  }
  if (!fileStat.isFile()) {
    throw createError({ statusCode: 404, message: "文件不存在" });
  }

  const ext = path.extname(resolvedFile).toLowerCase();
  setResponseHeader(event, "Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
  setResponseHeader(event, "Content-Length", fileStat.size);
  setResponseHeader(event, "Cache-Control", "public, max-age=31536000, immutable");

  return sendStream(event, createReadStream(resolvedFile));
});
