#!/usr/bin/env tsx
/**
 * API 类型自动生成脚本
 * 扫描 server/api 目录下的所有 API 文件，生成前端类型定义
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, relative, dirname } from "path";

// 配置
const API_DIR = join(process.cwd(), "server/api");
const OUTPUT_FILE = join(process.cwd(), "shared/api-types.generated.ts");

// 将文件路径转换为 API 路径
function filePathToApiPath(filePath: string, baseDir: string): string {
  const relPath = relative(baseDir, filePath)
    .replace(/\.(get|post|put|delete|patch)\.ts$/, "")
    .replace(/\.ts$/, "")
    .replace(/\[([^\]]+)\]/g, ":$1")
    .replace(/\\/g, "/");
  return "/" + relPath;
}

// 获取 HTTP 方法
function getHttpMethod(filePath: string): string {
  const match = filePath.match(/\.(get|post|put|delete|patch)\.ts$/);
  return match ? match[1].toLowerCase() : "get";
}

// 递归扫描目录
async function scanDir(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(fullPath, files);
    } else if (entry.name.endsWith(".ts") && entry.name !== "schemas.ts") {
      files.push(fullPath);
    }
  }
  return files;
}

// 主函数
async function main() {
  console.log("🔍 扫描 API 文件...");

  // 确保输出目录存在
  await mkdir(dirname(OUTPUT_FILE), { recursive: true });

  // 扫描所有 API 文件
  const apiFiles = await scanDir(API_DIR);
  console.log(`✅ 找到 ${apiFiles.length} 个 API 文件`);

  // 构建所有 API 路径和方法
  const apiPaths = new Map<string, Set<string>>();
  const typedApis = new Set<string>();

  for (const filePath of apiFiles) {
    const content = await readFile(filePath, "utf-8");
    const hasTypedHandler = content.includes("defineTypedApiHandler");

    const apiPath = filePathToApiPath(filePath, API_DIR);
    const method = getHttpMethod(filePath);

    if (!apiPaths.has(apiPath)) {
      apiPaths.set(apiPath, new Set());
    }
    apiPaths.get(apiPath)!.add(method);

    const key = `${method} ${apiPath}`;
    if (hasTypedHandler) {
      typedApis.add(key);
      console.log(`  ✅ ${method.toUpperCase()} ${apiPath}`);
    } else {
      console.log(`  ⚠️  ${method.toUpperCase()} ${apiPath} (未类型化)`);
    }
  }

  // 生成类型定义
  const apiEntries: string[] = [];

  for (const [apiPath, methods] of apiPaths.entries()) {
    const methodEntries: string[] = [];

    for (const method of methods) {
      // 手动处理已知的类型化 API
      if (apiPath === "/search" && method === "get") {
        methodEntries.push(`    get: {
      query: { q: string };
      body: any;
      response: { results: Array<{ cid: number; title: string; slug: string; desc: string | null; createTime: string | Date; categoryName: string | null; categorySlug: string | null; highlight?: string }>; total: number; query: string };
    };`);
      } else if (apiPath === "/site" && method === "get") {
        methodEntries.push(`    get: {
      query: any;
      body: any;
      response: { success: boolean; data: { siteName: string; siteUrl: string; siteDesc: string; siteIcp: string; homeCustomText: string; photoCategorySlug: string; commentEnabled: boolean; commentAvatarService: string; commentPageSize: number; commentMaxLevel: number; commentInterval: number; commentRequireMail: boolean; commentRequireLink: boolean; postPageSize: number; feedCacheInterval: number; linkAutoApprove: boolean } };
    };`);
      } else if (apiPath === "/comments/index" && method === "post") {
        methodEntries.push(`    post: {
      query: any;
      body: { csrfToken: string; cid: number; content: string; name: string; mail?: string | null; link?: string | null; parent_id?: number | null };
      response: { coid: number; cid: number; content: string; name: string; mail: string | null; link: string | null; parent_id: number | null; status: number; create_time: string | Date; agent: string | null; ip: string | null };
    };`);
      } else {
        methodEntries.push(`    ${method}: {
      query: any;
      body: any;
      response: any;
    };`);
      }
    }

    apiEntries.push(`  "${apiPath}": {\n${methodEntries.join("\n\n")}\n  };`);
  }

  // 生成最终的类型文件
  const typeFileContent = `/**
 * 自动生成的 API 类型定义
 * 此文件由 scripts/generate-api-types.ts 自动生成，请勿手动修改！
 * 生成时间: ${new Date().toISOString()}
 *
 * 包含 ${apiFiles.length} 个 API 端点
 * 已类型化: ${typedApis.size} 个端点
 *
 * 使用方式:
 * \`\`\`ts
 * import type { ApiTypes } from "~~/shared/api-types.generated";
 *
 * // 获取响应类型
 * type SearchResponse = ApiTypes["/search"]["get"]["response"];
 *
 * // 获取请求体类型
 * type CommentBody = ApiTypes["/comments/index"]["post"]["body"];
 * \`\`\`
 */

/**
 * API 接口类型映射
 * 结构: ApiTypes[路径][方法] = { query, body, response }
 */
export interface ApiTypes {
${apiEntries.join("\n\n")}
}

/**
 * 所有 API 路径联合类型
 */
export type ApiPath = keyof ApiTypes;
`;

  await writeFile(OUTPUT_FILE, typeFileContent, "utf-8");
  console.log(`\n✅ 类型定义已生成: ${OUTPUT_FILE}`);
  console.log(`   已处理 ${apiFiles.length} 个 API 端点`);
  console.log(`   已类型化 ${typedApis.size} 个端点`);
}

main().catch((error) => {
  console.error("❌ 生成类型失败:", error);
  process.exit(1);
});
