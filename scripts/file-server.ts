import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..', '.attachments');
const PORT = 3030;
// 默认不传 host：Node 会监听未指定地址（IPv6 `::` 双栈，同时接 IPv4），局域网内其他设备可直接访问。
// 只想本机用（不暴露给同网段）就 HOST=127.0.0.1 bun run serve
const HOST = process.env.HOST || "";

/** 本机可被局域网访问的 IPv4 地址（排除回环、未分配的网卡） */
function lanAddresses() {
  const list = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) list.push(info.address);
    }
  }
  return list;
}

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
};

// MIME 分类聚合（启动 banner 统计各类型数量；保持与 MIME_TYPES 同步）
const MIME_CATEGORY_TAGS = {
  '.html': 'text', '.htm': 'text', '.js': 'text', '.mjs': 'text',
  '.css': 'text', '.json': 'text', '.xml': 'text', '.txt': 'text',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
  '.svg': 'image', '.ico': 'image', '.webp': 'image', '.bmp': 'image',
  '.mp4': 'video', '.webm': 'video', '.ogg': 'video', '.avi': 'video',
  '.mov': 'video', '.wmv': 'video', '.flv': 'video', '.mkv': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio',
  '.woff': 'font', '.woff2': 'font', '.ttf': 'font', '.eot': 'font',
  '.pdf': 'document',
  '.zip': 'archive', '.rar': 'archive',
};

// 获取文件的 MIME 类型
function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return (MIME_TYPES as Record<string, string>)[ext] || 'application/octet-stream';
}

// 设置 CORS 响应头
// 实况照片（LivePhoto）需要在前端通过 fetch 抓取图片二进制并解析内嵌视频，
// 当页面与文件服务器不同源时，浏览器要求响应带 CORS 头才允许读取响应体。
function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ANSI 转义：仅在 TTY 输出（管道/重定向时不染色，便于 grep 过滤）
const TTY = process.stdout.isTTY === true;
const paint = TTY
  ? {
      dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
      green: (s: string) => `\x1b[32m${s}\x1b[0m`,
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
      cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
      red: (s: string) => `\x1b[31m${s}\x1b[0m`,
      magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
    }
  : { dim: (s: string) => s, bold: (s: string) => s, green: (s: string) => s, yellow: (s: string) => s, cyan: (s: string) => s, red: (s: string) => s, magenta: (s: string) => s };

function colorMethod(method: string | undefined): string {
  // GET/HEAD 默认；POST/PUT cyan；PATCH/PUT/DELETE 黄；OPTIONS dim
  if (!method) return "";
  const upper = method.toUpperCase();
  if (upper === "POST") return paint.cyan(upper);
  if (upper === "PUT" || upper === "DELETE" || upper === "PATCH") return paint.yellow(upper);
  if (upper === "OPTIONS") return paint.dim(upper);
  return upper;
}

function colorStatus(status: number): string {
  if (status >= 500) return paint.red(String(status));
  if (status >= 400) return paint.yellow(String(status));
  if (status >= 300) return paint.cyan(String(status));
  if (status >= 200) return paint.green(String(status));
  return String(status);
}

// 请求访问日志 —— 按 (method, path, status) 在短时间窗内合并，突发请求不刷屏
const LOG_ENABLED = process.env.LOG !== "0";
const LOG_FLUSH_MS = Number(process.env.LOG_FLUSH_MS) || 500;
const logBuffer: Map<string, number> = new Map();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushLogs() {
  if (logBuffer.size === 0) return;
  // 按 (method, path, status) 字典序打印，阅读更整齐
  const entries = [...logBuffer.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, count] of entries) {
    // key 是 "METHOD path status"；按空格切分染色，其它原样
    const parts = key.split(" ");
    const method = parts[0] ?? "";
    const path = parts.slice(1, -1).join(" ");
    const status = parts[parts.length - 1] ?? "";
    const head = `${paint.bold(colorMethod(method))} ${path} ${colorStatus(Number(status))}`;
    const tail = count > 1 ? ` ${paint.dim(`(x${count})`)}` : "";
    console.log(`${head}${tail}`);
  }
  logBuffer.clear();
}

function logRequest(method: string | undefined, rawUrl: string | undefined, status: number) {
  if (!LOG_ENABLED) return;
  // 剥 query，路径作为分组键更稳定
  const path = (rawUrl?.split("?")[0] || "/");
  const groupKey = `${method} ${path} ${status}`;
  logBuffer.set(groupKey, (logBuffer.get(groupKey) || 0) + 1);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLogs();
    }, LOG_FLUSH_MS);
  }
}

// 创建服务器
const server = http.createServer((req, res) => {
  // 统一加上 CORS 头（所有响应，包括 404/500/OPTIONS 都需要）
  setCorsHeaders(res);

  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    logRequest(req.method, req.url, 204);
    res.writeHead(204);
    res.end();
    return;
  }

  // 解析 URL 路径（非法百分号编码需吞掉，否则同步 URIError 崩掉整个 server）
  let requestPath;
  try {
    requestPath = decodeURIComponent(req.url || "");
  } catch {
    logRequest(req.method, req.url, 400);
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>400 Bad Request</h1>');
    return;
  }

  // 默认访问 index.html
  if (requestPath === '/') {
    requestPath = '/index.html';
  }

  // 移除开头的 /
  if (requestPath.startsWith('/')) {
    requestPath = requestPath.substring(1);
  }

  // 日志里要展示的原始 URL 路径（保留 leading /）
  const urlPath = `/${requestPath}`;

  // 构建完整路径并防目录穿越：normalize 折叠 `..` 后必须仍落在 ROOT_DIR 内，
  // 否则 `GET /../../.env` 会逃出 .attachments 读到任意文件（含密钥），且本 server 绑定 0.0.0.0 局域网可达。
  const resolved = path.resolve(ROOT_DIR);
  const filePath = path.resolve(path.join(resolved, requestPath));
  if (filePath !== resolved && !filePath.startsWith(resolved + path.sep)) {
    logRequest(req.method, urlPath, 403);
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>403 Forbidden</h1>');
    return;
  }

  // 检查文件是否存在
  fs.stat(filePath, (err, stats) => {
    if (err) {
      logRequest(req.method, urlPath, 404);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    // 如果是目录，尝试访问 index.html
    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (indexErr || !indexStats.isFile()) {
          logRequest(req.method, urlPath, 404);
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>404 Not Found</h1>');
          return;
        }
        serveFile(urlPath, indexPath, res, req.method);
      });
      return;
    }

    // 提供文件
    serveFile(urlPath, filePath, res, req.method);
  });
});

// 提供文件的函数
function serveFile(urlPath: string, filePath: string, res: http.ServerResponse, method: string | undefined) {
  const mimeType = getMimeType(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      logRequest(method, urlPath, 500);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>500 Internal Server Error</h1>');
      return;
    }

    logRequest(method, urlPath, 200);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// 启动服务器
const onListening = () => {
  // 监听模式：HOST 未指定时 Node 默认绑定 dual-stack（同时接 IPv4/IPv6）；显式给 HOST 则锁单地址
  const dualStack = !HOST || HOST === "0.0.0.0" || HOST === "::";
  const modeLabel = dualStack ? "IPv4/IPv6 双栈" : HOST;

  // MIME 按类别聚合，按数量降序输出
  const byCategory: Record<string, number> = {};
  for (const cat of Object.values(MIME_CATEGORY_TAGS)) {
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  Object.entries(byCategory)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([cat, count]) => `${cat} ${count}`)
    .join(" · ");

  console.log();
  console.log(`🚀  ${paint.bold(paint.green("文件服务器已启动"))}`);
  console.log();
  console.log(`📁 根目录:     ${paint.cyan(ROOT_DIR)}`);
  console.log(`🔗 监听:       ${paint.bold(String(PORT))}${modeLabel ? ` ${paint.dim(`(${modeLabel})`)}` : ""}`);
  console.log(`🔗 本机:       ${paint.cyan(`http://localhost:${PORT}/`)}`);
  if (dualStack) {
    const lan = lanAddresses();
    // 同网段设备（手机/平板）用下面的地址访问；连不上多半是系统防火墙拦了入站，放行 node 即可
    if (lan.length > 0) {
      console.log(`🌐 局域网:     ${lan.map(ip => paint.cyan(`http://${ip}:${PORT}/`)).join("  ")}`);
    } else {
      console.log(`ℹ️  局域网:     ${paint.dim("未发现可用网卡，仅本机可访问")}`);
    }
  } else {
    console.log(`ℹ️  局域网:     ${paint.dim(`已按 HOST=${HOST} 限制监听，局域网内其他设备访问不到`)}`);
  }
  console.log(`💡 提示:       ${paint.dim("将文件放到 .attachments 文件夹中；HOST=127.0.0.1 仅本机访问")}`);
  console.log();
};

if (HOST) server.listen(PORT, HOST, onListening);
else server.listen(PORT, onListening);

// 错误处理
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用`);
  } else {
    console.error('❌ 服务器错误:', err.message);
  }
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushLogs();
  console.log('\n👋 服务器已关闭');
  process.exit(0);
});
