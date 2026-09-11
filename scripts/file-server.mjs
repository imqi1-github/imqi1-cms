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

// 获取文件的 MIME 类型
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// 设置 CORS 响应头
// 实况照片（LivePhoto）需要在前端通过 fetch 抓取图片二进制并解析内嵌视频，
// 当页面与文件服务器不同源时，浏览器要求响应带 CORS 头才允许读取响应体。
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 创建服务器
const server = http.createServer((req, res) => {
  // 统一加上 CORS 头（所有响应，包括 404/500/OPTIONS 都需要）
  setCorsHeaders(res);

  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 解析 URL 路径（非法百分号编码需吞掉，否则同步 URIError 崩掉整个 server）
  let requestPath;
  try {
    requestPath = decodeURIComponent(req.url);
  } catch {
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

  // 构建完整路径并防目录穿越：normalize 折叠 `..` 后必须仍落在 ROOT_DIR 内，
  // 否则 `GET /../../.env` 会逃出 .attachments 读到任意文件（含密钥），且本 server 绑定 0.0.0.0 局域网可达。
  const resolved = path.resolve(ROOT_DIR);
  const filePath = path.resolve(path.join(resolved, requestPath));
  if (filePath !== resolved && !filePath.startsWith(resolved + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>403 Forbidden</h1>');
    return;
  }

  // 检查文件是否存在
  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    // 如果是目录，尝试访问 index.html
    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (indexErr || !indexStats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>404 Not Found</h1>');
          return;
        }
        serveFile(indexPath, res);
      });
      return;
    }

    // 提供文件
    serveFile(filePath, res);
  });
});

// 提供文件的函数
function serveFile(filePath, res) {
  const mimeType = getMimeType(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>500 Internal Server Error</h1>');
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// 启动服务器
const onListening = () => {
  console.log(`\n🚀 文件服务器已启动！`);
  console.log(`📁 根目录: ${ROOT_DIR}`);
  console.log(`🔗 本机访问: http://localhost:${PORT}/`);
  if (!HOST || HOST === "0.0.0.0" || HOST === "::") {
    const lan = lanAddresses();
    // 同网段设备（手机/平板）用下面的地址访问；连不上多半是系统防火墙拦了入站，放行 node 即可
    for (const ip of lan) console.log(`🌐 局域网访问: http://${ip}:${PORT}/`);
    if (lan.length === 0) console.log(`ℹ️ 未发现可用网卡，当前仅本机可访问`);
  } else {
    console.log(`ℹ️ 已按 HOST=${HOST} 限制监听地址，局域网内其他设备访问不到`);
  }
  console.log(`💡 提示: 将文件放到 .attachments 文件夹中\n`);
};

if (HOST) server.listen(PORT, HOST, onListening);
else server.listen(PORT, onListening);

// 错误处理
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用`);
  } else {
    console.error('❌ 服务器错误:', err.message);
  }
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 服务器已关闭');
  process.exit(0);
});
