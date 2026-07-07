import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

import { getUser } from "#server/lib/auth";
import type { AttachmentUploadLocation, LocalUploadResult } from "#server/types/apis/upload-strategy";
import { createAttachmentMetadata } from "#server/utils/attachmentMetadata";
import { getPublicDir } from "#server/utils/attachment-file";
import { uploadToCOS } from "#server/utils/cos";
import { validateCsrfToken } from "#server/utils/csrf";
import prisma from "#server/utils/prisma";
import { validateAttachmentData } from "#server/utils/validation";

// 允许的文件类型
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

// 文件魔数（Magic Number）映射
const FILE_MAGIC_NUMBERS: Record<string, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": Buffer.from([0x47, 0x49, 0x46, 0x38]),
  "image/webp": Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
  "video/mp4": Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
  "video/webm": Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
};

// 验证文件魔数
function validateFileMagicNumber(buffer: Buffer, mimeType: string): boolean {
  const magicNumber = FILE_MAGIC_NUMBERS[mimeType];
  if (!magicNumber) return true; // 如果没有定义魔数，跳过检查

  // 检查文件开头是否匹配魔数
  for (let i = 0; i < magicNumber.length; i++) {
    if (buffer[i] !== magicNumber[i]) {
      return false;
    }
  }
  return true;
}

// 最大文件大小 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// 实况照片保留原始 JPEG+MP4 字节，体积通常大于普通图片
const MAX_LIVE_PHOTO_SIZE = 50 * 1024 * 1024;
const LIVE_PHOTO_TYPES = ["image/jpeg", "image/jpg"];

// 生成唯一文件名
function generateFileName(originalName: string): string {
  const ext = path.extname(originalName);
  const uuid = randomUUID();
  const date = new Date().toISOString().split("T")[0];
  return `${date}-${uuid}${ext}`;
}

// 本地上传
async function uploadToLocal(fileBuffer: Buffer, fileName: string): Promise<LocalUploadResult> {
  try {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const uploadDir = path.join(getPublicDir(), "uploads", year, month);
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, fileBuffer);

    return {
      success: true,
      url: `/uploads/${year}/${month}/${fileName}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "本地上传失败",
    };
  }
}
// 获取文件类型分类
function getFileCategory(mimeType: string): "image" | "video" {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return "image";
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return "video";
  return "image"; // 默认
}

function getFormatFromUrl(url: string): string | null {
  const cleanUrl = url.split("#")[0]?.split("?")[0] ?? url;
  const ext = path.extname(cleanUrl).toLowerCase().slice(1);
  return ext === "jpeg" ? "jpg" : ext || null;
}

export default defineEventHandler(async event => {
  try {
    // 检查是否登录
    const user = await getUser(event);
    if (!user) {
      throw createError({
        statusCode: 401,
        message: "未登录",
      });
    }

    // 编辑器上传会传文章/页面 ID；后台附件管理上传允许不关联内容
    const rawCid = getQuery(event).cid;
    const cid = rawCid == null || rawCid === "" ? null : Number(rawCid);

    if (cid !== null && !Number.isInteger(cid)) {
      throw createError({
        statusCode: 400,
        message: "文章 ID 无效",
      });
    }

    if (cid !== null) {
      // 检查文章/页面是否存在
      const post = await prisma.posts.findUnique({
        where: { cid },
      });

      if (!post) {
        throw createError({
          statusCode: 404,
          message: "文章不存在",
        });
      }
    }

    // 读取表单数据
    const formData = await readFormData(event);
    const file = formData.get("file") as File;
    const csrfToken = formData.get("csrfToken") as string;
    const isLivePhoto = formData.get("livePhoto") === "true";

    // CSRF 验证
    if (!validateCsrfToken(event, csrfToken)) {
      throw createError({
        statusCode: 403,
        message: "CSRF token 验证失败，请刷新页面重试",
      });
    }

    if (!file) {
      throw createError({
        statusCode: 400,
        message: "未选择文件",
      });
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw createError({
        statusCode: 400,
        message: `不支持的文件类型: ${file.type}`,
      });
    }

    if (isLivePhoto && !LIVE_PHOTO_TYPES.includes(file.type)) {
      throw createError({
        statusCode: 400,
        message: "实况照片必须为 JPEG 格式",
      });
    }

    // 读取文件内容（用于魔数验证）
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 验证文件魔数，防止伪造文件类型
    if (!validateFileMagicNumber(buffer, file.type)) {
      throw createError({
        statusCode: 400,
        message: `文件内容与声明的类型不匹配，可能是恶意文件`,
      });
    }

    // 验证文件大小
    const maxFileSize = isLivePhoto ? MAX_LIVE_PHOTO_SIZE : MAX_FILE_SIZE;
    if (file.size > maxFileSize) {
      throw createError({
        statusCode: 400,
        message: `文件大小超过限制 (最大 ${maxFileSize / 1024 / 1024}MB)`,
      });
    }

    // 生成文件名
    const fileName = generateFileName(file.name);

    const uploadLocationMeta = await prisma.informations.findUnique({
      where: { key: "uploadLocation" },
    });
    const uploadLocation = (uploadLocationMeta?.value === "cos" ? "cos" : "local") satisfies AttachmentUploadLocation;

    // 获取图片后缀配置
    const imageSuffixMeta = uploadLocation === "cos"
      ? await prisma.informations.findUnique({
          where: { key: "cosImageSuffix" },
        })
      : null;
    const imageSuffix = imageSuffixMeta?.value || undefined;

    // 如果是图片且配置了后缀，传递给上传函数；实况照片必须保留原始 JPEG+MP4 字节
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const result = uploadLocation === "cos"
      ? await uploadToCOS(buffer, fileName, file.type, isImage && !isLivePhoto ? imageSuffix : undefined)
      : await uploadToLocal(buffer, fileName);

    if (!result.success) {
      throw createError({
        statusCode: 500,
        message: result.error || (uploadLocation === "cos" ? "COS上传失败" : "本地上传失败"),
      });
    }

    let fileUrl = result.url!;

    if (isLivePhoto) {
      fileUrl = `${fileUrl}#live`;
    }

    // 获取文件类型分类
    const category = getFileCategory(file.type);
    const rawMetadata = createAttachmentMetadata(buffer, file);
    const metadata = {
      ...rawMetadata,
      format: getFormatFromUrl(fileUrl) ?? rawMetadata.format,
    };

    // 验证字段长度
    validateAttachmentData({
      title: file.name,
      type: category,
      url: fileUrl,
    });

    // 保存到数据库
    const attachment = await prisma.$transaction(async tx => {
      const created = await tx.attachments.create({
        data: {
          type: category,
          title: file.name,
          url: fileUrl,
          storage: uploadLocation,
          metadata,
        },
      });

      if (cid !== null) {
        await tx.postattachments.create({
          data: {
            aid: created.aid,
            cid,
          },
        });
      }

      return created;
    });

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
        type: attachment.type,
        url: attachment.url,
        size: metadata.size,
        metadata,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        create_time: attachment.create_time,
        storage: uploadLocation,
      },
    };
  } catch (error) {
    console.error(error);

    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: "获取上传附件失败",
    });
  }
});
