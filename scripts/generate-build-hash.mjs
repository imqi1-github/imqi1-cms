import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

// 读取 site.config.ts 检查是否配置了 CDN
function hasCdnConfig() {
  try {
    const configPath = join(process.cwd(), 'site.config.ts');
    if (!existsSync(configPath)) {
      console.log('ℹ 未找到 site.config.ts');
      return false;
    }

    const content = readFileSync(configPath, 'utf-8');
    // 匹配 _cdnUrl = "..." 或 _cdnUrl = '...' （包括空字符串）
    const match = content.match(/_cdnUrl\s*=\s*(["'])([^"']*)\1/);
    if (!match) {
      console.log('ℹ 未找到 _cdnUrl 配置');
      return false;
    }

    const cdnUrl = match[2].trim();
    console.log(`ℹ 检测到 CDN 配置: "${cdnUrl}"`);

    // 检查是否为有效的 HTTP URL
    const isValid = cdnUrl.startsWith('http://') || cdnUrl.startsWith('https://');
    if (!isValid) {
      console.log('ℹ CDN 配置为空或无效，跳过 hash 生成');
    }
    return isValid;
  } catch {
    console.warn('⚠ 无法读取 site.config.ts，默认不生成 build hash');
    return false;
  }
}

// 生成时间戳 hash（可选，更可读）
function generateTimestampHash() {
  const now = Date.now();
  const rand = randomBytes(2).toString('hex');
  return `${now.toString(36)}-${rand}`;
}

const ROOT_DIR = process.cwd();
const HASH_FILE = join(ROOT_DIR, '.build-hash');
const HASH_DIR_FILE = join(ROOT_DIR, '.build-hash-dir');

// 只有配置了 CDN 才生成 hash
if (!hasCdnConfig()) {
  console.log('ℹ 未配置 CDN，跳过 build hash 生成');
  // 删除可能存在的旧 hash 文件
  if (existsSync(HASH_FILE)) {
    writeFileSync(HASH_FILE, '', 'utf-8');
  }
  if (existsSync(HASH_DIR_FILE)) {
    writeFileSync(HASH_DIR_FILE, '', 'utf-8');
  }
  process.exit(0);
}

// 选择 hash 生成方式（二选一）
const hash = generateTimestampHash(); // 更可读，包含时间戳
// const hash = generateHash();       // 纯随机，更短

// 保存 hash 值
writeFileSync(HASH_FILE, hash, 'utf-8');

// 保存完整目录路径（用于上传脚本）
const hashDir = `static/${hash}`;
writeFileSync(HASH_DIR_FILE, hashDir, 'utf-8');

console.log(`✓ Build hash generated: ${hash}`);
console.log(`✓ CDN path: /${hashDir}`);
