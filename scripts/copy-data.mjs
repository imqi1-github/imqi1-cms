import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = join(process.cwd(), 'data');
const targetDir = join(process.cwd(), '.output', 'server', 'data');

console.log('Copying data files to build output...');

if (existsSync(sourceDir)) {
  // 创建目标目录
  mkdirSync(targetDir, { recursive: true });

  // 复制 qqwry.dat
  const sourceFile = join(sourceDir, 'qqwry.dat');
  const targetFile = join(targetDir, 'qqwry.dat');

  if (existsSync(sourceFile)) {
    copyFileSync(sourceFile, targetFile);
    console.log('✓ Copied qqwry.dat to .output/server/data/');
  } else {
    console.warn('⚠ qqwry.dat not found in data/ directory');
  }
} else {
  console.warn('⚠ data/ directory not found');
}
