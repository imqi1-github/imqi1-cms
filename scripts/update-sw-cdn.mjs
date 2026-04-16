import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取构建 hash
const buildHashDirPath = join(process.cwd(), '.build-hash-dir');
let buildHashDir = '';

if (existsSync(buildHashDirPath)) {
  // build-hash-dir 文件内容已经包含 "static/" 前缀，不需要再加前导斜杠
  buildHashDir = readFileSync(buildHashDirPath, 'utf-8').trim();
}

const cdnBaseURL = 'https://cdn.imqi1.com';
const cdnURL = buildHashDir ? `${cdnBaseURL}/${buildHashDir}` : cdnBaseURL;

console.log('✓ CDN URL:', cdnURL);

// 查找并修改 sw.js
const swPath = join(process.cwd(), '.output', 'public', 'sw.js');

if (!existsSync(swPath)) {
  console.log('✗ sw.js not found, skipping CDN update');
  process.exit(0);
}

let swContent = readFileSync(swPath, 'utf-8');

// 1. 查找并替换 Vite PWA 的 workbox 导入：define(["./workbox-xxx"]
const workboxImportRegex = /define\(\["\.\/(workbox-[a-f0-9]+)"\]/g;
const workboxMatches = [...swContent.matchAll(workboxImportRegex)];

if (workboxMatches.length === 0) {
  console.log('✗ No workbox imports found in sw.js');
  process.exit(0);
}

console.log(`✓ Found ${workboxMatches.length} workbox import(s)`);

// 替换 workbox 为 CDN 路径
workboxMatches.forEach((match) => {
  const fullMatch = match[0];
  const workboxFile = match[1];
  const cdnUrl = `${cdnURL}/${workboxFile}`;

  console.log(`  Replacing: ${workboxFile} -> ${cdnUrl}`);
  swContent = swContent.replace(fullMatch, `define(["${cdnUrl}"]`);
});

// 2. 替换 precacheAndRoute 中的所有静态资源路径为 CDN 路径
// 匹配 url:"_nuxt/...", url:"manifest.webmanifest" 等
const precacheRegex = /url:"(_nuxt\/[^"]+|manifest\.webmanifest|[^"]+\.json)"/g;
const precacheMatches = [...swContent.matchAll(precacheRegex)];

if (precacheMatches.length > 0) {
  console.log(`✓ Found ${precacheMatches.length} precache resource(s)`);
  precacheMatches.forEach((match) => {
    const fullMatch = match[0];
    const resourcePath = match[1];

    // 跳过已经是完整 URL 的路径
    if (resourcePath.startsWith('http://') || resourcePath.startsWith('https://')) {
      return;
    }

    const cdnUrl = `${cdnURL}/${resourcePath}`;
    console.log(`  Replacing: ${resourcePath} -> ${cdnUrl}`);
    swContent = swContent.replace(fullMatch, `url:"${cdnUrl}"`);
  });
}

// 写回文件
writeFileSync(swPath, swContent, 'utf-8');
console.log('✓ Updated sw.js with CDN paths for workbox and all static resources');

// 同时需要将 workbox 文件复制到单独的目录供上传
const publicDir = join(process.cwd(), '.output', 'public');
const workboxFiles = readdirSync(publicDir).filter(file => file.startsWith('workbox-') && file.endsWith('.js'));

if (workboxFiles.length > 0) {
  console.log(`✓ Found ${workboxFiles.length} workbox file(s) for CDN upload:`);
  workboxFiles.forEach(file => {
    console.log(`  - ${file}`);
  });
  console.log(`\n→ Upload these files to CDN: ${cdnURL}/`);
}

// 3. 将修改后的 sw.js 复制到 server 目录
const serverDir = join(process.cwd(), '.output', 'server');
const serverSwPath = join(serverDir, 'sw.js');

try {
  // 确保 server 目录存在
  if (!existsSync(serverDir)) {
    mkdirSync(serverDir, { recursive: true });
  }

  // 复制 sw.js 到 server 目录
  copyFileSync(swPath, serverSwPath);
  console.log('✓ Copied sw.js to .output/server/sw.js');
} catch (error) {
  console.error('✗ Failed to copy sw.js to server directory:', error.message);
}
