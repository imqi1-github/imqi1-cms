#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

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

const portProd = requireEnv('DEPLOY_PORT');
const serverRoot = requireEnv('DEPLOY_PROJECT_ROOT_DIR');
const cdnDomain = requireEnv('DEPLOY_CDN_DOMAIN');
const siteDomain = requireEnv('DEPLOY_SITE_DOMAIN');
const enableCdnRedirect = requireEnv('DEPLOY_ENABLE_CDN_REDIRECT') === 'true';

// ============================================================
// 恢复真实客户端 IP（provider 无关，适配任意 CDN/云接入/负载均衡）
// ============================================================
// 当源站前还有一层接入层时，nginx 的 $remote_addr 是「回源节点 IP」而非访客 IP，
// 会导致评论入库 IP / 足迹去重 / 限流键全部塌缩成接入层节点 IP。
// 这里用 real_ip 模块从上游转发头里恢复真实客户端：
//   - DEPLOY_TRUSTED_PROXY：前端接入层的「回源 IP 段」，逗号分隔（支持单个 IP 或 CIDR）。
//       填信任谁，必然要知道谁——任意家的接入层填各自回源段即可；若源站防火墙只对
//       接入层开放（外部无法直连源站），可填 0.0.0.0/0（信任所有转发头，安全前提是直连被阻断）。
//   - DEPLOY_REAL_IP_HEADER：上游把真实客户端写在哪个头（默认 X-Forwarded-For，几乎全行业通用；
//       Cloudflare 用 CF-Connecting-IP 等可覆盖）。
const trustedProxy = (process.env.DEPLOY_TRUSTED_PROXY || '').trim();
const realIpHeader = (process.env.DEPLOY_REAL_IP_HEADER || 'X-Forwarded-For').trim();

console.log('📝 生成 Nginx 配置...');
console.log(`  站点域名: ${siteDomain}`);
console.log(`  CDN 域名: ${cdnDomain}`);
console.log(`  Node 端口: ${portProd}`);
console.log(`  项目根目录: ${serverRoot}`);
console.log(`  CDN 重定向: ${enableCdnRedirect ? '启用' : '禁用'}`);
console.log(`  真实IP恢复: ${trustedProxy ? `启用（头=${realIpHeader}，回源段=${trustedProxy}）` : '未启用（DEPLOY_TRUSTED_PROXY 为空）'}\n`);

// 恢复真实客户端 IP 的指令块（仅在配置了回源段时输出；valid 于 server context）
const realIpBlock = trustedProxy
  ? `# ============================================
# 恢复真实客户端 IP（源站前有 CDN/云接入/负载均衡时启用）
#   real_ip_recursive on：从下发头最右往回走，跳过 DEPLOY_TRUSTED_PROXY 里的可信回源段，
#   落在「第一个非回源 IP」即真实客户端。之后 $remote_addr 即为真实客户端，
#   下方 X-Real-IP / X-Forwarded-For 会正确携带真实 IP，评论入库/足迹/限流即正确。
# ============================================
${trustedProxy.split(',').map((ip) => `set_real_ip_from ${ip.trim()};`).filter(Boolean).join('\n')}
real_ip_header ${realIpHeader};
real_ip_recursive on;

`
  : `# DEPLOY_TRUSTED_PROXY 为空：未恢复真实客户端 IP。
# 若源站前有 CDN/接入层，评论/足迹/限流会记录成接入层节点 IP。请在 .env 填写回源段后重新生成。
#   - 列出接入层回源 IP 段（逗号分隔）；或源站只对接入层开放时填 0.0.0.0/0。

`;

// Nginx 配置片段（适用于宝塔面板，已在面板配置好 server 块，只需添加以下内容）
const nginxConf = `${realIpBlock}# Service Worker（必须从主域名提供，不允许 CDN 跨域）
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
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
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
# 如果需要启用 CDN 重定向，请在 .env 中设置 DEPLOY_ENABLE_CDN_REDIRECT=true
`
  }

# ============================================
# 反向代理到 Node.js 服务
# ============================================

# 静态资源：未走上方 CDN 重定向 301 的缓存资产（如 _nuxt 构建块、CDN 关闭时的 imgs/fonts 等）一律带长缓存，
# 避免落进下方 location / 的 no-store（浏览器重复下载）。CDN 开启时 imgs/fonts/icons/… 已在上方 301 到 CDN
#（正则按定义顺序、首条命中优先生效），故这里只为兜底其余静态（如 /static/<hash>/、/_nuxt 构建块）。
location ~* \\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp4|webm|webmanifest)$ {
    proxy_pass http://127.0.0.1:${portProd};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering on;
    add_header Cache-Control "public, max-age=31536000" always;
}

# API 接口：保留上游 Cache-Control（routeRules 对 /api/* 设 public, max-age=300, s-maxage=300），
# 让 CDN/浏览器缓存。不能放进下方 location / 的 proxy_hide_header/no-store，否则会抹掉该缓存。
location /api {
    proxy_pass http://127.0.0.1:${portProd};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering on;
}

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
    proxy_cache off;
    # 上游（Nuxt 的 ISR routeRules）会给页面带 s-maxage，CDN 会照存 → 页面被缓成旧哈希。
    # 这里先 proxy_hide_header 移除上游 Cache-Control，再统一设为 no-store，谨防 CDN 缓存动态页。
    proxy_hide_header Cache-Control;
    # always：4xx/5xx（SSR 404/500/403）也要带上 no-store，否则 CDN 会去启发式缓存这些错误页
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
}
`;

// 生成输出文件
const outputPath = path.join(ROOT_DIR, 'nginx.conf');
fs.writeFileSync(outputPath, nginxConf, 'utf-8');

console.log(`✅ Nginx 配置片段已生成: ${outputPath}`);
