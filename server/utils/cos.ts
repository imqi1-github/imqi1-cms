import { createHash, createHmac } from "crypto";

import { prisma } from "./prisma";

import type { CosConfig, CosDeleteResult, CosUploadResult } from "#server/types/utils/cos";

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
    Bucket: config.Bucket,
    Region: config.Region,
    sourceDomain: domains.source || "自动生成",
    cdnDomain: domains.cdn || "未配置",
  });

  return { valid: true };
}

// 获取访问域名
async function getCosDomain(existingConfig?: CosConfig | null): Promise<{ source: string; cdn: string }> {
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

    // 如果没有配置源站域名，则生成默认域名（复用调用方已查好的配置，避免重复查库）
    const config = existingConfig === undefined ? await getCosConfig() : existingConfig;
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

  // 步骤二：生成 SignKey
  const signKey = createHmac("sha1", secretKey).update(keyTime, "utf8").digest("hex");

  // 步骤三：生成 HttpParameters 和 UrlParamList
  const urlParamList = "";
  const httpParameters = "";

  // 步骤四：生成 HttpHeaders 和 HeaderList
  // 需要参与签名的头部（按字典序）；只添加实际存在且 fetch 会真正发送的头。
  // 注意：Date/Host 属于 WHATWG fetch 禁设头（会被剥离/自动重建），纳入签名会导致
  // 服务端按实际收到的头重算签名不一致 → 这里只签 content-md5/content-type。
  const headerMap: Record<string, string> = {};

  // 遍历所有headers，只添加需要的
  for (const key of Object.keys(headers)) {
    const lowerKey = key.toLowerCase();
    // 只包含这些头部：content-md5, content-type
    if (["content-md5", "content-type"].includes(lowerKey)) {
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

  // 步骤五：生成 HttpString
  const httpMethod = method.toLowerCase();
  const uriPathname = path.startsWith("/") ? path : `/${path}`;

  const httpString = [httpMethod, uriPathname, httpParameters, httpHeaders, ""].join("\n");

  // 步骤六：生成 StringToSign
  const httpStringSha1 = createHash("sha1").update(httpString, "utf8").digest("hex");

  const stringToSign = `sha1\n${keyTime}\n${httpStringSha1}\n`;

  // 步骤七：生成 Signature
  const signature = createHmac("sha1", signKey).update(stringToSign, "utf8").digest("hex");

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

  return authorization;
}

// 上传文件到COS
export async function uploadToCOS(fileBuffer: Buffer, fileName: string, contentType: string, imageSuffix?: string): Promise<CosUploadResult> {
  try {
    // 只读一次配置与域名：原 validateCosConfig→getCosConfig→getCosDomain 会在单次上传重复查库
    const config = await getCosConfig();
    if (!config) {
      return {
        success: false,
        error: "COS配置不完整，请检查后台设置",
      };
    }

    const domains = await getCosDomain(config);
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

    // 构造请求头：Date/Host 由 fetch 传输层自动处理（显式置入会被 WHATWG fetch 剥离），
    // 签名只需覆盖实际发送的 content-md5/content-type，避免头不一致导致 COS 验签失败
    const headers: Record<string, string> = {
      "Content-Type": finalContentType,
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

function normalizeUploadPath(pathname: string): string | null {
  const withoutHash = pathname.split("#")[0] ?? pathname;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  let normalized = withoutQuery.replace(/^\/+/, "").replace(/\\/g, "/");

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // 解码失败时继续使用原路径
  }

  if (!normalized.startsWith("uploads/")) return null;
  if (normalized.split("/").some(segment => segment === "..")) return null;

  return `/${normalized}`;
}

function getCosUploadPath(fileUrl: string, domains: { source: string; cdn: string }): string | null {
  const cleanUrl = fileUrl.trim().split("#")[0]?.split("?")[0] ?? fileUrl.trim();
  const normalizedSource = domains.source.replace(/\/$/, "");
  const normalizedCdn = domains.cdn.replace(/\/$/, "");

  if (normalizedSource && cleanUrl.startsWith(normalizedSource)) {
    return normalizeUploadPath(cleanUrl.slice(normalizedSource.length));
  }

  if (normalizedCdn && cleanUrl.startsWith(normalizedCdn)) {
    return normalizeUploadPath(cleanUrl.slice(normalizedCdn.length));
  }

  try {
    return normalizeUploadPath(new URL(cleanUrl).pathname);
  } catch {
    return normalizeUploadPath(cleanUrl);
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

    const domains = await getCosDomain(config);
    if (!domains.source) {
      return {
        success: false,
        error: "COS源站域名配置错误",
      };
    }

    const filePath = getCosUploadPath(fileUrl, domains);
    if (!filePath) {
      return {
        success: false,
        error: "只允许删除 /uploads/ 下的 COS 文件",
      };
    }

    // 构建删除URL（必须使用源站域名）
    const deleteUrl = `${domains.source.replace(/\/$/, "")}${filePath}`;

    console.log("[COS删除] URL转换:", {
      originalUrl: fileUrl,
      sourceDomain: domains.source,
      cdnDomain: domains.cdn || "未配置",
      filePath,
      deleteUrl,
    });

    // 构造请求头：DELETE 无 body/特殊头；Host 由 fetch 按 URL 自动生成。签名 HeaderList 为空即合法。
    const headers: Record<string, string> = {};

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
