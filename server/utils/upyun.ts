import * as crypto from "crypto";

import prisma from "./prisma";

import type { UpYunConfig, UploadResult } from "#server/types/utils/upyun";

// 又拍云 API 端点
const UPYUN_API_ENDPOINT = "v0.api.upyun.com";

// 从数据库获取又拍云配置
export async function getUpYunConfig(): Promise<UpYunConfig | null> {
  try {
    const meta = await prisma.informations.findMany({
      where: {
        key: {
          in: ["upyunService", "upyunOperator", "upyunPassword", "upyunDomain"],
        },
      },
    });

    const config: Record<string, string> = {};
    meta.forEach(meta => {
      config[meta.key] = meta.value;
    });

    const bucket = config.upyunService?.trim();
    const operator = config.upyunOperator?.trim();
    const password = config.upyunPassword?.trim();
    const domain = config.upyunDomain?.trim();

    if (!bucket || !operator || !password) {
      return null;
    }

    return { bucket, operator, password, domain };
  } catch (error) {
    console.error(error);
    return null;
  }
}

// 生成又拍云签名 (使用 HMAC-SHA1)
// 文档: https://help.upyun.com/knowledge-base/rest_api/#rest_api_2
function generateSignature(method: string, uri: string, date: string, passwordMd5: string): string {
  // 签名字符串格式: METHOD&URI&DATE&Content-MD5
  // Content-MD5 可选，此处省略
  const signStr = `${method}&${uri}&${date}`;
  return crypto.createHmac("sha1", passwordMd5).update(signStr, "utf-8").digest().toString("base64");
}

// 密码 MD5 加密
function md5Password(password: string): string {
  return crypto.createHash("md5").update(password, "utf-8").digest("hex");
}

// 图片处理配置接口
export interface ImageProcessOptions {
  enabled: boolean;
  thumbnailVersion?: string;
  outputMode?: string;
}

// 上传文件到又拍云
export async function uploadToUpYun(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  imageProcess?: ImageProcessOptions,
): Promise<UploadResult> {
  const config = await getUpYunConfig();

  if (!config) {
    return {
      success: false,
      error: "又拍云配置不完整，请检查设置",
    };
  }

  const { bucket, operator, password, domain } = config;
  const passwordMd5 = md5Password(password);

  // 文件路径：/uploads/年/月/文件名
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const filePath = `/uploads/${year}/${month}/${fileName}`;
  const uri = `/${bucket}${filePath}`;

  // 生成日期头（RFC 1123 格式）
  const date = new Date().toUTCString();

  // 生成签名
  const signature = generateSignature("PUT", uri, date, passwordMd5);

  try {
    // 构建请求头
    const headers: Record<string, string> = {
      Authorization: `UPYUN ${operator}:${signature}`,
      Date: date,
      "Content-Type": contentType,
      "Content-Length": String(fileBuffer.length),
      Mkdir: "true", // 自动创建目录
    };

    // 添加图片处理参数（仅对图片类型生效）
    if (imageProcess?.enabled && contentType.startsWith("image/")) {
      const processParams: string[] = [];

      // 添加缩略图版本
      if (imageProcess.thumbnailVersion) {
        processParams.push(imageProcess.thumbnailVersion);
      }

      // 添加输出格式转换
      if (imageProcess.outputMode) {
        processParams.push(`/format/${imageProcess.outputMode}`);
      }

      // 如果有处理参数，添加到请求头
      if (processParams.length > 0) {
        headers["x-gmkerl-thumb"] = processParams.join("");
        console.log("[UpYun] 图片处理已启用，参数:", headers["x-gmkerl-thumb"]);
      } else {
        console.log("[UpYun] 图片处理已开启，但未配置处理参数");
      }
    }

    const response = await fetch(`https://${UPYUN_API_ENDPOINT}${uri}`, {
      method: "PUT",
      headers,
      body: new Uint8Array(fileBuffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `上传失败: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    // 返回完整的访问 URL
    const url = `${domain ?? ""}${filePath}`;
    return { success: true, url };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: `上传失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

// 删除又拍云上的文件
export async function deleteFromUpYun(filePath: string): Promise<boolean> {
  const config = await getUpYunConfig();

  if (!config) {
    return false;
  }

  const { bucket, operator, password } = config;
  const passwordMd5 = md5Password(password);

  // 从 URL 中提取文件路径
  // 假设 URL 格式为: https://domain/uploads/2024/01/file.jpg
  let uri = filePath;
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    const url = new URL(filePath);
    uri = url.pathname;
  }

  const fullUri = `/${bucket}${uri}`;
  const date = new Date().toUTCString();
  const signature = generateSignature("DELETE", fullUri, date, passwordMd5);

  try {
    const response = await fetch(`https://${UPYUN_API_ENDPOINT}${fullUri}`, {
      method: "DELETE",
      headers: {
        Authorization: `UPYUN ${operator}:${signature}`,
        Date: date,
      },
    });

    return response.ok;
  } catch (error) {
    console.error(error);
    return false;
  }
}
