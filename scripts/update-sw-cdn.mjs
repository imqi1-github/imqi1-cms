import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";

// ========== 从 nitro.mjs 读取 build-hash ==========
// nuxt.config.ts 的 buildHash 在构建时烘焙到 .output/server/chunks/_/nitro.mjs
// postbuild 脚本应读取它（而不是重新生成），保证 build-hash.json 和服务端 hash 一致
let buildHash = "";
let buildHashDir = "";
try {
  const nitroMjs = readFileSync(join(process.cwd(), ".output", "server", "chunks", "_", "nitro.mjs"), "utf-8");
  const match = nitroMjs.match(/"buildHash":\s*"([^"]+)"/);
  if (match) {
    buildHash = match[1];
    buildHashDir = `static/${buildHash}`;
    mkdirSync(join(process.cwd(), ".output"), { recursive: true });
    writeFileSync(join(process.cwd(), ".output", "build-hash.json"), JSON.stringify({ hash: buildHash, dir: buildHashDir }, null, 2), "utf-8");
    console.log(`✓ build-hash.json 生成: ${buildHashDir}`);
  }
} catch (e) {
  console.error(`✗ build-hash.json 生成失败: ${e.message}`);
}

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

// CDN URL：使用开头生成的 hash
const cdnURL = `${cdnBaseURL}/${buildHashDir}`;

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
const precacheRegex = /url:"([^"]+\.(?:js|css|html|ico|png|svg|ttf|woff|woff2|json|webmanifest)(?:\.(?:br|gz))?)"/g;
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

    // root 级资源（favicon/manifest + imgs/skills/fonts 等）走 cdn 根（不带 hash），
    // 其余（构建产物，位于 hash 目录）走 cdn/<hash>，避免「同源 URL → 301 → 跨域 CDN」
    // 触发 Workbox7 copyRedirectedCacheableResponsesPlugin 的 cross-origin-copy-response
    const isRootAsset =
      resourcePath === "manifest.webmanifest" ||
      resourcePath === "favicon.ico" ||
      /^(imgs|skills|fonts)\//.test(resourcePath);
    const cdnBase = isRootAsset ? cdnBaseURL : cdnURL;
    const cdnUrl = `${cdnBase}/${resourcePath}`;
    console.log(`  Replacing: ${resourcePath} -> ${cdnUrl}`);
    swContent = swContent.replace(fullMatch, `url:"${cdnUrl}"`);
  });
} else {
  // 理论不会发生（globPatterns 已恢复，precache 应有资源）；兜底提示
  console.log("ℹ 未发现 precache 资源（可能是 globPatterns 为空），跳过 CDN 路径改写");
}

// 写回文件
writeFileSync(swPath, swContent, "utf-8");
console.log("✓ sw.js 处理完成（CDN 预备缓存已禁用，sw.js/robots.txt 照常拷到 server 根）");

// 将根目录文件复制到 server 目录
copyPublicFileToServerRoot("sw.js");
copyPublicFileToServerRoot("robots.txt");
