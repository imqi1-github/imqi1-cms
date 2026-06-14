import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..', '.attachments');
const PORT = 3030;

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

  // 解析 URL 路径
  let requestPath = decodeURIComponent(req.url);

  // 默认访问 index.html
  if (requestPath === '/') {
    requestPath = '/index.html';
  }

  // 移除开头的 /
  if (requestPath.startsWith('/')) {
    requestPath = requestPath.substring(1);
  }

  // 构建完整的文件路径
  const filePath = path.join(ROOT_DIR, requestPath);

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
server.listen(PORT, () => {
  console.log(`\n🚀 文件服务器已启动！`);
  console.log(`📁 根目录: ${ROOT_DIR}`);
  console.log(`🔗 访问地址: http://localhost:${PORT}/`);
  console.log(`💡 提示: 将文件放到 .attachments 文件夹中\n`);
});

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
