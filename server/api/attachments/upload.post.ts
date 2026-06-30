import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

import { getUser } from "#server/lib/auth";
import { uploadToCOS } from "#server/utils/cos";
import { validateCsrfToken } from "#server/utils/csrf";
import prisma from "#server/utils/prisma";
import { uploadToUpYun } from "#server/utils/upyun";
import { validateAttachmentData } from "#server/utils/validation";
import type { ImageProcessOptions } from "#server/types/utils/upyun";

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

// 生成唯一文件名
function generateFileName(originalName: string): string {
  const ext = path.extname(originalName);
  const uuid = randomUUID();
  const date = new Date().toISOString().split("T")[0];
  return `${date}-${uuid}${ext}`;
}

// 生成上传路径（包含年月目录）
function generateUploadPath(fileName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return path.join("uploads", String(year), month, fileName);
}

// 获取文件类型分类
function getFileCategory(mimeType: string): "image" | "video" {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return "image";
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return "video";
  return "image"; // 默认
}

// 本地存储上传
async function uploadToLocal(fileBuffer: Buffer, fileName: string): Promise<string> {
  const uploadPath = generateUploadPath(fileName);
  const fullPath = path.join(process.cwd(), "public", uploadPath);

  // 确保目录存在
  const dirPath = path.dirname(fullPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  fs.writeFileSync(fullPath, fileBuffer);
  return `/${uploadPath.replace(/\\/g, "/")}`;
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

    // 获取文章 ID
    const cid = Number(getQuery(event).cid);

    if (!cid) {
      throw createError({
        statusCode: 400,
        message: "缺少文章 ID",
      });
    }

    // 检查文章是否存在
    const post = await prisma.posts.findUnique({
      where: { cid },
    });

    if (!post) {
      throw createError({
        statusCode: 404,
        message: "文章不存在",
      });
    }

    // 读取表单数据
    const formData = await readFormData(event);
    const file = formData.get("file") as File;
    const csrfToken = formData.get("csrfToken") as string;

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
    if (file.size > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 400,
        message: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      });
    }

    // 生成文件名
    const fileName = generateFileName(file.name);

    // 获取上传位置配置
    const uploadLocationMeta = await prisma.informations.findUnique({
      where: { key: "uploadLocation" },
    });
    const uploadLocation = uploadLocationMeta?.value || "local";

    let fileUrl: string;

    // 根据配置选择上传方式
    if (uploadLocation === "upyun") {
      // 获取图片处理配置
      const imageProcessMeta = await prisma.informations.findMany({
        where: {
          key: {
            in: ["upyunImageProcess", "upyunThumbnailVersion", "upyunOutputMode"],
          },
        },
      });

      const imageProcessConfig: Record<string, string> = {};
      imageProcessMeta.forEach(meta => {
        imageProcessConfig[meta.key] = meta.value;
      });

      // 构建图片处理参数
      const imageProcess: ImageProcessOptions = {
        enabled: imageProcessConfig.upyunImageProcess === "true",
        thumbnailVersion: imageProcessConfig.upyunThumbnailVersion || undefined,
        outputMode: imageProcessConfig.upyunOutputMode || undefined,
      };

      console.log("[上传] 图片处理配置:", {
        原始值: imageProcessConfig,
        解析后: imageProcess,
      });

      // 又拍云上传
      const result = await uploadToUpYun(buffer, fileName, file.type, imageProcess);
      if (!result.success) {
        throw createError({
          statusCode: 500,
          message: result.error || "又拍云上传失败",
        });
      }
      fileUrl = result.url!;
    } else if (uploadLocation === "cos") {
      // 腾讯云COS上传

      // 获取图片后缀配置
      const imageSuffixMeta = await prisma.informations.findUnique({
        where: { key: "cosImageSuffix" },
      });
      const imageSuffix = imageSuffixMeta?.value || undefined;

      // 如果是图片且配置了后缀，传递给上传函数
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
      const result = await uploadToCOS(buffer, fileName, file.type, isImage ? imageSuffix : undefined);

      if (!result.success) {
        throw createError({
          statusCode: 500,
          message: result.error || "COS上传失败",
        });
      }
      fileUrl = result.url!;
    } else {
      // 本地存储
      fileUrl = await uploadToLocal(buffer, fileName);
    }

    // 获取文件类型分类
    const category = getFileCategory(file.type);

    // 验证字段长度
    validateAttachmentData({
      title: file.name,
      type: category,
      url: fileUrl,
    });

    // 保存到数据库
    const attachment = await prisma.attachments.create({
      data: {
        cid,
        type: category,
        title: file.name,
        url: fileUrl,
        storage: uploadLocation,
      },
    });

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
        type: attachment.type,
        url: attachment.url,
        size: formatFileSize(file.size),
        create_time: attachment.create_time,
        storage: uploadLocation,
      },
    };
  } catch (error) {
    console.error(error);

    throw createError({
      statusCode: 500,
      message: "获取上传附件失败",
    });
  }
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
