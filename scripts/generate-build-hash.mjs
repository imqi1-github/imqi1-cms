import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

// 生成 8 字符的随机 hash
function generateHash() {
  return randomBytes(4).toString('hex');
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
