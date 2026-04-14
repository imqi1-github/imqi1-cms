import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// 格式化输出函数
function log(title, text, color = colors.white) {
  console.log(`${color}${colors.bright}${title}${colors.reset}: ${text}`);
}

function section(title) {
  console.log(`\n${colors.cyan}${colors.bright}════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}════════════════════════════════════════${colors.reset}\n`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(num) {
  return new Intl.NumberFormat('zh-CN').format(num);
}

// 获取构建信息
function getBuildInfo() {
  const info = {
    success: false,
    timestamp: new Date().toLocaleString('zh-CN'),
    git: {},
    buildHash: null,
    nodeVersion: process.version,
    packageManager: process.env.npm_config_user_agent || 'Unknown',
    env: process.env.NODE_ENV || 'production',
  };

  // 读取构建 hash
  if (existsSync('.build-hash-dir')) {
    info.buildHash = readFileSync('.build-hash-dir', 'utf-8').trim();
  }

  // Git 信息
  try {
    info.git.branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    info.git.commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    info.git.shortCommit = info.git.commit.substring(0, 7);
    info.git.commitMessage = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();
    info.git.commitAuthor = execSync('git log -1 --pretty=%an', { encoding: 'utf-8' }).trim();
    info.git.commitDate = execSync('git log -1 --pretty=%ad --date=iso', { encoding: 'utf-8' }).trim();
    info.git.dirty = execSync('git status --porcelain', { encoding: 'utf-8' }).trim().length > 0;
  } catch (error) {
    info.git.error = error.message;
  }

  return info;
}

// 分析构建输出
function analyzeBuildOutput() {
  const outputDir = join(process.cwd(), '.output');
  const analysis = {
    exists: false,
    serverSize: 0,
    clientSize: 0,
    totalSize: 0,
    files: 0,
  };

  if (!existsSync(outputDir)) {
    return analysis;
  }

  analysis.exists = true;

  try {
    const { execSync } = require('child_process');

    // 计算服务器文件大小
    try {
      const serverSize = execSync(`du -sb "${join(outputDir, 'server')}"`, { encoding: 'utf-8' });
      analysis.serverSize = parseInt(serverSize.split('\t')[0]);
    } catch (e) {
      // ignore
    }

    // 计算客户端文件大小
    try {
      const clientSize = execSync(`du -sb "${join(outputDir, 'public')}"`, { encoding: 'utf-8' });
      analysis.clientSize = parseInt(clientSize.split('\t')[0]);
    } catch (e) {
      // ignore
    }

    analysis.totalSize = analysis.serverSize + analysis.clientSize;

    // 统计文件数量
    try {
      const fileCount = execSync(`find "${outputDir}" -type f | wc -l`, { encoding: 'utf-8' });
      analysis.files = parseInt(fileCount.trim());
    } catch (e) {
      // ignore
    }
  } catch (error) {
    // ignore
  }

  return analysis;
}

// 打印构建信息
function printBuildInfo() {
  const info = getBuildInfo();

  section('🏗️  Nuxt 构建信息');

  // 基本信息
  log('构建时间', info.timestamp, colors.green);
  log('环境', info.env, colors.yellow);
  log('构建 Hash', info.buildHash || '无', colors.cyan);

  // 运行时信息
  console.log(`${colors.white}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  log('Node 版本', info.nodeVersion, colors.blue);
  log('包管理器', info.packageManager, colors.blue);

  // Git 信息
  if (!info.git.error) {
    console.log(`\n${colors.white}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    log('Git 分支', info.git.branch, colors.cyan);
    log('Git 提交', info.git.shortCommit, colors.cyan);
    log('提交作者', info.git.commitAuthor, colors.yellow);
    log('提交信息', info.git.commitMessage, colors.white);
    log('提交时间', info.git.commitDate, colors.dim);

    if (info.git.dirty) {
      console.log(`\n${colors.red}⚠️  警告: 工作区有未提交的更改${colors.reset}`);
    }
  } else {
    console.log(`\n${colors.dim}Git 信息不可用${colors.reset}`);
  }
}

// 打印构建结果
function printBuildResult(success = true) {
  const analysis = analyzeBuildOutput();

  section(success ? '✅ 构建成功' : '❌ 构建失败');

  if (analysis.exists) {
    log('服务器大小', formatBytes(analysis.serverSize), colors.green);
    log('客户端大小', formatBytes(analysis.clientSize), colors.green);
    log('总大小', formatBytes(analysis.totalSize), colors.bright + colors.green);
    log('文件数量', formatNumber(analysis.files), colors.cyan);

    const efficiency = ((analysis.clientSize / analysis.totalSize) * 100).toFixed(1);
    console.log(`\n${colors.dim}客户端占比: ${efficiency}%${colors.reset}`);
  } else {
    console.log(`${colors.red}构建输出不存在${colors.reset}`);
  }
}

// 主函数
async function main() {
  console.clear();

  const startTime = Date.now();

  // 打印构建前信息
  printBuildInfo();

  console.log(`\n${colors.bright}${colors.yellow}🚀 开始构建...${colors.reset}\n`);

  // 执行构建
  try {
    execSync('npm run build', {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 打印构建结果
    printBuildResult(true);

    console.log(`\n${colors.green}${colors.bright}⏱️  构建耗时: ${duration}秒${colors.reset}\n`);

    console.log(`${colors.cyan}${colors.bright}📦 下一步操作:${colors.reset}`);
    console.log(`  ${colors.dim}1.${colors.reset} 本地测试: ${colors.yellow}npm run preview${colors.reset}`);
    console.log(`  ${colors.dim}2.${colors.reset} 上传 CDN: ${colors.yellow}npm run upload:cos${colors.reset}`);
    console.log(`  ${colors.dim}3.${colors.reset} 启动服务: ${colors.yellow}npm run pm2:start${colors.reset}\n`);

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    printBuildResult(false);
    console.log(`\n${colors.red}⏱️  构建耗时: ${duration}秒${colors.reset}`);
    console.log(`${colors.red}${colors.bright}❌ 构建失败，请检查错误信息${colors.reset}\n`);

    process.exit(1);
  }
}

main();
