#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 加载环境变量
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

// 读取并验证必须环境变量
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ 错误: 环境变量 ${name} 必须配置，请检查 .env 文件`);
    process.exit(1);
  }
  return value;
}

const portProd = requireEnv('PORT_PROD');
const serverRoot = requireEnv('PROJECT_ROOT_DIR_PROD');
const cdnDomain = requireEnv('CDN_DOMAIN_PROD');
const siteDomain = requireEnv('SITE_DOMAIN_PROD');
const enableCdnRedirect = requireEnv('ENABLE_CDN_REDIRECT_PROD') === 'true';

console.log('📝 生成 Nginx 配置...');
console.log(`  站点域名: ${siteDomain}`);
console.log(`  CDN 域名: ${cdnDomain}`);
console.log(`  Node 端口: ${portProd}`);
console.log(`  项目根目录: ${serverRoot}`);
console.log(`  CDN 重定向: ${enableCdnRedirect ? '启用' : '禁用'}\n`);

// Nginx 配置片段（适用于宝塔面板，已在面板配置好 server 块，只需添加以下内容）
const nginxConf = `# Service Worker（必须从主域名提供，不允许 CDN 跨域）
location = /sw.js {
    root ${serverRoot};
    add_header Cache-Control "no-cache" always;
    add_header Service-Worker-Allowed "/" always;
}

# robots.txt（必须从主域名提供，不允许 CDN）
location = /robots.txt {
    root ${serverRoot};
    add_header Cache-Control "public, max-age=3600" always;
}

# RSS 订阅
location = /feed {
    proxy_pass http://127.0.0.1:${portProd};
    proxy_set_header Host $host:$server_port;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header X-Host $host:$server_port;
    proxy_set_header X-Scheme $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # 关键：绕过缓存
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}

# ============================================
# 高德地图同源代理
# 前端访问 /_AMapService/* → 转发给高德 API，避免跨域
# ============================================
location ^~ /_AMapService/ {
    proxy_pass http://127.0.0.1:${portProd};
    proxy_set_header Host $host:$server_port;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    add_header X-Cache $upstream_cache_status;
    proxy_set_header X-Host $host:$server_port;
    proxy_set_header X-Scheme $scheme;
    proxy_connect_timeout 30s;
    proxy_read_timeout 86400s;
    proxy_send_timeout 30s;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# CDN 重定向规则（静态资源）
${enableCdnRedirect ? `
# 单文件重定向
location = /favicon.ico {
    return 301 https://${cdnDomain}/favicon.ico;
}
location = /manifest.webmanifest {
    return 301 https://${cdnDomain}/manifest.webmanifest;
}

# 静态资源目录重定向
location ~ ^/(emojis|fonts|icons|imgs|skills)/ {
    return 301 https://${cdnDomain}$request_uri;
}

# 上传文件重定向
location ~ ^/(uploads)/ {
    return 301 https://${cdnDomain}$request_uri;
}
` : `
# CDN 重定向已禁用（静态资源由 Nuxt routeRules 处理）
# 如果需要启用 CDN 重定向，请在 .env 中设置 ENABLE_CDN_REDIRECT_PROD=true
`
  }

# ============================================
# 反向代理到 Node.js 服务
# ============================================
location / {
    proxy_pass http://127.0.0.1:${portProd};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering on;
    proxy_buffer_size 64k;
    proxy_buffers 32 64k;
    proxy_busy_buffers_size 128k;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
`;

// 生成输出文件
const outputPath = path.join(ROOT_DIR, 'nginx.conf');
fs.writeFileSync(outputPath, nginxConf, 'utf-8');

console.log(`✅ Nginx 配置片段已生成: ${outputPath}`);
