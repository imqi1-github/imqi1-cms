import { createHash, createHmac } from "crypto";

import { prisma } from "./prisma";

import type { CosConfig } from "#server/types/utils/cos";

// 获取COS配置
async function getCosConfig(): Promise<CosConfig | null> {
  try {
    const meta = await prisma.informations.findMany({
      where: {
        key: {
          in: ["cosSecretId", "cosSecretKey", "cosBucket", "cosRegion"],
        },
      },
    });

    const config: Record<string, string> = {};
    meta.forEach(meta => {
      config[meta.key] = meta.value;
    });

    if (!config.cosSecretId || !config.cosSecretKey || !config.cosBucket || !config.cosRegion) {
      return null;
    }

    return {
      SecretId: config.cosSecretId,
      SecretKey: config.cosSecretKey,
      Bucket: config.cosBucket,
      Region: config.cosRegion,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

// 验证配置
export async function validateCosConfig(): Promise<{ valid: boolean; error?: string }> {
  const config = await getCosConfig();
  if (!config) {
    return { valid: false, error: "COS配置不完整" };
  }

  const domains = await getCosDomain();

  console.log("[COS配置验证]", {
    SecretId: config.SecretId.substring(0, 15) + "...",
    Bucket: config.Bucket,
    Region: config.Region,
    sourceDomain: domains.source || "自动生成",
    cdnDomain: domains.cdn || "未配置",
  });

  return { valid: true };
}

// 获取访问域名
async function getCosDomain(): Promise<{ source: string; cdn: string }> {
  try {
    const meta = await prisma.informations.findMany({
      where: {
        key: {
          in: ["cosSourceDomain", "cosCdnDomain"],
        },
      },
    });

    const domains: Record<string, string> = {};
    meta.forEach(meta => {
      domains[meta.key] = meta.value;
    });

    // 如果没有配置源站域名，则生成默认域名
    const config = await getCosConfig();
    if (!domains.cosSourceDomain && config) {
      domains.cosSourceDomain = `https://${config.Bucket}.cos.${config.Region}.myqcloud.com`;
    }

    return {
      source: domains.cosSourceDomain || "",
      cdn: domains.cosCdnDomain || "",
    };
  } catch (error) {
    console.error(error);
    return { source: "", cdn: "" };
  }
}

// URL编码函数
function urlEncode(str: string): string {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}

// 生成腾讯云COS签名（官方算法）
function generateSignature(method: string, path: string, headers: Record<string, string>, secretKey: string, secretId: string): string {
  // 步骤一：生成 KeyTime
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + 600}`;

  console.log("[COS签名] KeyTime:", keyTime);

  // 步骤二：生成 SignKey
  const signKey = createHmac("sha1", secretKey).update(keyTime, "utf8").digest("hex");

  console.log("[COS签名] SignKey:", signKey);

  // 步骤三：生成 HttpParameters 和 UrlParamList
  const urlParamList = "";
  const httpParameters = "";

  // 步骤四：生成 HttpHeaders 和 HeaderList
  // 需要参与签名的头部（按字典序）
  // 注意：只添加实际存在的头部
  const headerMap: Record<string, string> = {};

  // 遍历所有headers，只添加需要的
  for (const key of Object.keys(headers)) {
    const lowerKey = key.toLowerCase();
    // 只包含这些头部：content-md5, content-type, date, host
    if (["content-md5", "content-type", "date", "host"].includes(lowerKey)) {
      headerMap[lowerKey] = headers[key] ?? "";
    }
  }

  // 按 key 字典序排序
  const sortedKeys = Object.keys(headerMap).sort();

  // 生成 HttpHeaders
  const httpHeadersParts = sortedKeys.map(key => {
    return `${key}=${urlEncode(headerMap[key] ?? "")}`;
  });
  const httpHeaders = httpHeadersParts.join("&");

  // 生成 HeaderList
  const headerList = sortedKeys.join(";");

  console.log("[COS签名] HeaderList:", headerList);
  console.log("[COS签名] HttpHeaders:", httpHeaders);

  // 步骤五：生成 HttpString
  const httpMethod = method.toLowerCase();
  const uriPathname = path.startsWith("/") ? path : `/${path}`;

  const httpString = [httpMethod, uriPathname, httpParameters, httpHeaders, ""].join("\n");

  console.log("[COS签名] HttpString:", JSON.stringify(httpString));

  // 步骤六：生成 StringToSign
  const httpStringSha1 = createHash("sha1").update(httpString, "utf8").digest("hex");

  const stringToSign = `sha1\n${keyTime}\n${httpStringSha1}\n`;

  console.log("[COS签名] StringToSign:", JSON.stringify(stringToSign));
  console.log("[COS签名] HttpString SHA1:", httpStringSha1);

  // 步骤七：生成 Signature
  const signature = createHmac("sha1", signKey).update(stringToSign, "utf8").digest("hex");

  console.log("[COS签名] Signature:", signature);

  // 步骤八：生成 Authorization
  const authorization = [
    `q-sign-algorithm=sha1`,
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=${urlParamList}`,
    `q-signature=${signature}`,
  ].join("&");

  console.log("[COS签名] Authorization:", authorization);

  return authorization;
}

// 上传文件到COS
export async function uploadToCOS(fileBuffer: Buffer, fileName: string, contentType: string, imageSuffix?: string): Promise<CosUploadResult> {
  try {
    // 验证配置
    const validation = await validateCosConfig();
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || "COS配置验证失败",
      };
    }

    // 获取配置
    const config = await getCosConfig();
    if (!config) {
      return {
        success: false,
        error: "COS配置不完整，请检查后台设置",
      };
    }

    const domains = await getCosDomain();
    if (!domains.source) {
      return {
        success: false,
        error: "COS源站域名配置错误",
      };
    }

    // 处理图片后缀转换
    let finalFileName = fileName;
    let finalContentType = contentType;

    // 检查是否是图片且需要转换后缀
    const isImage = contentType.startsWith("image/");
    if (isImage && imageSuffix) {
      // 移除原扩展名，添加新后缀
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      finalFileName = `${nameWithoutExt}.${imageSuffix}`;

      // 更新 Content-Type（根据新后缀）
      const mimeTypes: Record<string, string> = {
        webp: "image/webp",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
      };
      finalContentType = mimeTypes[imageSuffix] || contentType;

      console.log("[COS上传] 图片后缀转换:", {
        原文件名: fileName,
        新文件名: finalFileName,
        原类型: contentType,
        新类型: finalContentType,
      });
    }

    // 文件路径：/uploads/年/月/文件名
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const filePath = `/uploads/${year}/${month}/${finalFileName}`;
    const url = `${domains.source}${filePath}`;

    // 生成Date头部（必须使用GMT格式）
    const date = new Date().toUTCString();

    // 获取Host（从URL中提取）
    const sourceUrl = new URL(domains.source);
    const host = sourceUrl.hostname;

    // 构造请求头
    const headers: Record<string, string> = {
      "Content-Type": finalContentType,
      Date: date,
      Host: host,
    };

    // 计算Content-MD5
    headers["Content-MD5"] = createHash("md5").update(fileBuffer).digest("base64");

    // 生成签名
    headers["Authorization"] = generateSignature("PUT", filePath, headers, config.SecretKey, config.SecretId);

    console.log("[COS上传] 开始上传:", {
      url,
      filePath,
      size: fileBuffer.length,
      contentType: finalContentType,
    });

    // 发送PUT请求上传文件
    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: new Uint8Array(fileBuffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error({
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return {
        success: false,
        error: `COS上传失败: ${response.status} ${response.statusText}`,
      };
    }

    // 返回CDN域名（如果配置了）或源站域名
    const accessUrl = domains.cdn || domains.source;
    const fileUrl = `${accessUrl}${filePath}`;

    console.log("[COS上传] 成功:", fileUrl);

    return {
      success: true,
      url: fileUrl,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || "COS上传失败",
    };
  }
}

// 从COS删除文件
export async function deleteFromCOS(fileUrl: string): Promise<CosDeleteResult> {
  try {
    // 获取配置
    const config = await getCosConfig();
    if (!config) {
      return {
        success: false,
        error: "COS配置不完整",
      };
    }

    const domains = await getCosDomain();
    if (!domains.source) {
      return {
        success: false,
        error: "COS源站域名配置错误",
      };
    }

    // 从URL中提取文件路径
    // URL格式可能是: https://domain/uploads/file.ext 或 https://bucket.cos.region.myqcloud.com/uploads/file.ext

    // 先尝试从源站域名提取路径
    let filePath = fileUrl.replace(domains.source, "");

    // 如果filePath包含完整URL（说明用的是CDN域名），需要从CDN域名提取
    if (filePath.startsWith("http")) {
      // 尝试从CDN域名提取
      if (domains.cdn) {
        filePath = fileUrl.replace(domains.cdn, "");
      } else {
        // 如果没有配置CDN域名，尝试从URL对象中提取路径
        try {
          const urlObj = new URL(fileUrl);
          filePath = urlObj.pathname;
        } catch (error) {
          console.error(error);
          // 如果解析失败，使用默认逻辑
          filePath = "/" + fileUrl.split("/").slice(3).join("/");
        }
      }
    }

    // 确保路径以 / 开头
    if (!filePath.startsWith("/")) {
      filePath = "/" + filePath;
    }

    // 构建删除URL（必须使用源站域名）
    const deleteUrl = `${domains.source}${filePath}`;

    console.log("[COS删除] URL转换:", {
      originalUrl: fileUrl,
      sourceDomain: domains.source,
      cdnDomain: domains.cdn || "未配置",
      filePath,
      deleteUrl,
    });

    // 生成Date头部
    const date = new Date().toUTCString();

    // 构造请求头
    const headers: Record<string, string> = {
      Date: date,
      Host: new URL(domains.source).hostname,
    };

    // 生成签名
    headers["Authorization"] = generateSignature("DELETE", filePath, headers, config.SecretKey, config.SecretId);

    console.log("[COS删除] 请求信息:", {
      url: deleteUrl,
      method: "DELETE",
      filePath,
    });

    // 发送DELETE请求
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error({
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return {
        success: false,
        error: `COS删除失败: ${response.status} ${response.statusText}`,
      };
    }

    console.log("[COS删除] 成功:", filePath);

    return {
      success: true,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || "COS删除失败",
    };
  }
}
