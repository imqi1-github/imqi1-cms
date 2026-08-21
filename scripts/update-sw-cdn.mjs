import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";

// 从 site.config.ts 读取 CDN 配置
function getCdnConfig() {
  try {
    const configPath = join(process.cwd(), "site.config.ts");
    if (!existsSync(configPath)) return null;

    const content = readFileSync(configPath, "utf-8");
    const match = content.match(/_cdnUrl\s*=\s*(["'])([^"']*)\1/);
    if (!match) return null;

    const cdnUrl = match[2].trim();
    if (!cdnUrl.startsWith("http://") && !cdnUrl.startsWith("https://")) {
      return null;
    }
    return cdnUrl;
  } catch {
    return null;
  }
}

const cdnBaseURL = getCdnConfig();

function copyPublicFileToServerRoot(fileName) {
  const sourcePath = join(process.cwd(), ".output", "public", fileName);
  if (!existsSync(sourcePath)) {
    console.log(`ℹ ${fileName} not found, skipping server root copy`);
    return;
  }

  const serverDir = join(process.cwd(), ".output", "server");
  const targetPath = join(serverDir, fileName);

  try {
    if (!existsSync(serverDir)) {
      mkdirSync(serverDir, { recursive: true });
    }

    copyFileSync(sourcePath, targetPath);
    console.log(`✓ Copied ${fileName} to .output/server/${fileName}`);
  } catch (error) {
    console.error(`✗ Failed to copy ${fileName} to server directory:`, error.message);
  }
}

// 如果没有配置 CDN，跳过所有处理
if (!cdnBaseURL) {
  console.log("ℹ 未配置 CDN，跳过 sw.js CDN 路径更新");

  // 仍然复制根目录文件到 server 目录（即使没有 CDN 也需要）
  copyPublicFileToServerRoot("sw.js");
  copyPublicFileToServerRoot("robots.txt");
  process.exit(0);
}

// 读取构建 hash
const buildHashDirPath = join(process.cwd(), ".build-hash-dir");
let buildHashDir = "";

if (existsSync(buildHashDirPath)) {
  // build-hash-dir 文件内容已经包含 "static/" 前缀，不需要再加前导斜杠
  buildHashDir = readFileSync(buildHashDirPath, "utf-8").trim();
}

const cdnURL = buildHashDir ? `${cdnBaseURL}/${buildHashDir}` : cdnBaseURL;

console.log("✓ CDN URL:", cdnURL);

// 查找并修改 sw.js
const swPath = join(process.cwd(), ".output", "public", "sw.js");

if (!existsSync(swPath)) {
  console.log("✗ sw.js not found, skipping CDN update");
  copyPublicFileToServerRoot("robots.txt");
  process.exit(0);
}

let swContent = readFileSync(swPath, "utf-8");

// 替换 precacheAndRoute 中的所有静态资源路径为 CDN 路径
// 匹配扁平化后的构建产物 url:"entry.<hash>.js"、url:"<hash>.css"、url:"builds/*.json"、
// url:"*.js.br"/"*.css.gz" 等，以及 url:"manifest.webmanifest"
// 注：workbox 运行时已通过 inlineWorkboxRuntime 内联进 sw.js，无需再处理 workbox 导入
const precacheRegex = /url:"([^"]+\.(?:js|css|json)(?:\.(?:br|gz))?|manifest\.webmanifest)"/g;
const precacheMatches = [...swContent.matchAll(precacheRegex)];

if (precacheMatches.length > 0) {
  console.log(`✓ Found ${precacheMatches.length} precache resource(s)`);
  precacheMatches.forEach(match => {
    const fullMatch = match[0];
    const resourcePath = match[1];

    // 跳过已经是完整 URL 的路径
    if (resourcePath.startsWith("http://") || resourcePath.startsWith("https://")) {
      return;
    }

    // manifest.webmanifest 从 CDN 根目录加载（不带 hash），其他从 hash 目录加载
    const cdnBase = resourcePath === "manifest.webmanifest" ? cdnBaseURL : cdnURL;
    const cdnUrl = `${cdnBase}/${resourcePath}`;
    console.log(`  Replacing: ${resourcePath} -> ${cdnUrl}`);
    swContent = swContent.replace(fullMatch, `url:"${cdnUrl}"`);
  });
}

// 写回文件
writeFileSync(swPath, swContent, "utf-8");
console.log("✓ Updated sw.js with CDN paths for all static resources");

// 将根目录文件复制到 server 目录
copyPublicFileToServerRoot("sw.js");
copyPublicFileToServerRoot("robots.txt");
