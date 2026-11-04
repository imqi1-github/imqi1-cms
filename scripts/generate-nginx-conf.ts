#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 加载环境变量
dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

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
// CDN 要缓存页面 HTML 时必须透传源站的 Cache-Control；否则这里强制 no-cache 会把边缘缓存废掉
const enableCdnPageCache = (process.env.DEPLOY_CDN_CACHE_PAGES || '').trim() === 'true';

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
// 逐项清洗：去掉尾部多余的分号/逗号与空白（写成 "0.0.0.0/0;" 会生成 set_real_ip_from 0.0.0.0/0;; → nginx 报错）
const trustedProxyList = trustedProxy
  .split(',')
  .map((entry) => entry.trim().replace(/[;,\s]+$/, ''))
  .filter(Boolean);

// 递归模式：on = 取 XFF 里最后一个「非受信」地址（多跳链适用）；
// off = 取 XFF 最后一个地址（即最近一跳代理追加的那个）。
// 信任 0.0.0.0/0（全受信）时 on 会找不到非受信地址 → nginx 保留对端地址（CDN 节点 IP），
// 所有访客 IP 塌缩成同一个 → 评论 IP 全一样、限流键合并成一个。故全受信时默认 off。
const trustsEverything = trustedProxyList.some(ip => ip === '0.0.0.0/0' || ip === '::/0');
const realIpRecursiveSetting = (process.env.DEPLOY_REAL_IP_RECURSIVE || '').trim().toLowerCase();
const realIpRecursive = realIpRecursiveSetting === 'on' || realIpRecursiveSetting === 'off'
  ? realIpRecursiveSetting
  : (trustsEverything ? 'off' : 'on');

console.log('📝 生成 Nginx 配置...');
console.log(`  站点域名: ${siteDomain}`);
console.log(`  CDN 域名: ${cdnDomain}`);
console.log(`  Node 端口: ${portProd}`);
console.log(`  项目根目录: ${serverRoot}`);
console.log(`  CDN 重定向: ${enableCdnRedirect ? '启用' : '禁用'}`);
console.log(`  CDN 页面缓存: ${enableCdnPageCache ? '启用（透传源站 Cache-Control）' : '禁用（源站强制 no-cache）'}`);
console.log(`  真实IP恢复: ${trustedProxyList.length ? `启用（头=${realIpHeader}，回源段=${trustedProxyList.join(',')}，递归=${realIpRecursive}）` : '未启用（DEPLOY_TRUSTED_PROXY 为空）'}\n`);

// 恢复真实客户端 IP 的指令块（仅在配置了回源段时输出；valid 于 server context）
const realIpBlock = trustedProxyList.length
  ? `# 恢复真实客户端 IP（源站前有 CDN/云接入/负载均衡时启用）
${trustedProxyList.map((ip) => `set_real_ip_from ${ip};`).join('\n')}
real_ip_header ${realIpHeader};
real_ip_recursive ${realIpRecursive};

`
  : `# DEPLOY_TRUSTED_PROXY 为空：未恢复真实客户端 IP

`;

// Nginx 配置片段（适用于宝塔面板，已在面板配置好 server 块，只需添加以下内容）
// 页面缓存交给 CDN 边缘时，nginx 不能再强制 no-cache、也不能隐藏源站的 Cache-Control
const serverCacheControl = enableCdnPageCache
  ? ''
  : 'add_header Cache-Control "no-cache, no-store, must-revalidate";';

const locationCacheControl = enableCdnPageCache
  ? ''
  : '    proxy_hide_header Cache-Control;\n    add_header Cache-Control "no-cache, no-store, must-revalidate" always;';

const nginxConf = `# 关闭 Nginx 缓存
proxy_no_cache 1;
proxy_cache_bypass 1;
${serverCacheControl}

${realIpBlock}# Service Worker（必须从主域名提供，不允许 CDN 跨域）
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
    # 关键：绕过 nginx 自身缓存
    proxy_no_cache 1;
    proxy_cache_bypass 1;
${enableCdnPageCache ? '' : '    add_header Cache-Control "no-cache, no-store, must-revalidate" always;'}
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
# 反向代理到 Node.js 服务，若在宝塔面板的伪静态中则本段不用复制
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
    proxy_cache off;
${locationCacheControl}
}
`;

// 生成输出文件
const outputPath = path.join(ROOT_DIR, 'nginx.conf');
fs.writeFileSync(outputPath, nginxConf, 'utf-8');

console.log(`✅ Nginx 配置片段已生成: ${outputPath}`);
