import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

import dotenv from 'dotenv'

import { ProgressConsole, progressText } from './lib/progress.mjs'

const require = createRequire(import.meta.url)
const SftpClient = require('ssh2-sftp-client')

// 加载环境变量（锚定仓库根 .env，勿依赖调用 cwd——脚本可能从任意目录运行）
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const SOURCE_DIR = path.join(ROOT_DIR, '.output', 'server')
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
// 默认不上传 node_modules；加 --node-modules 才上传
const includeNodeModules = args.includes('--node-modules')

const config = {
  host: process.env.SERVER_HOST || process.env.SERVER_IP,
  port: Number(process.env.SERVER_PORT || 22),
  username: process.env.SERVER_USERNAME || process.env.SERVER_USER || 'root',
  password: process.env.SERVER_PASSWORD,
  remoteDir: process.env.SERVER_UPLOAD_DIR,
  concurrency: Number(process.env.SERVER_UPLOAD_CONCURRENCY || 8),
}

function validateConfig() {
  const missing = []
  if (!config.host) missing.push('SERVER_HOST 或 SERVER_IP')
  if (!config.password) missing.push('SERVER_PASSWORD')
  if (!config.remoteDir) missing.push('SERVER_UPLOAD_DIR')

  if (missing.length > 0) {
    console.error('❌ 缺少服务器上传配置，请检查 .env：')
    missing.forEach(key => console.error(`  - ${key}`))
    process.exit(1)
  }

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ 源目录不存在: ${SOURCE_DIR}`)
    console.error('请先运行构建命令: bun run build')
    process.exit(1)
  }
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    // 默认跳过 node_modules 目录（任意层级）
    if (!includeNodeModules && file === 'node_modules') continue

    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList)
    } else {
      fileList.push(filePath)
    }
  }

  return fileList
}

// 统计目录内文件数量（用于提示被跳过的 node_modules 文件数）
function countDirFiles(dir) {
  let count = 0
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const filePath = path.join(dir, file)
    if (fs.statSync(filePath).isDirectory()) count += countDirFiles(filePath)
    else count++
  }
  return count
}

function toRemotePath(...parts) {
  return path.posix.join(...parts.map(part => part.replace(/\\/g, '/')))
}

async function ensureRemoteDir(sftp, dir) {
  await sftp.mkdir(dir, true)
}

async function uploadFile(sftp, localPath, remotePath, maxRetries = 3) {
  let lastError

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sftp.fastPut(localPath, remotePath)
      return
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

async function concurrentUpload(sftp, files) {
  const results = {
    success: 0,
    failed: 0,
    errors: [],
  }
  const executing = []
  const remoteDirs = new Set()
  const pc = new ProgressConsole()
  const total = files.length

  for (const file of files) {
    const promise = (async () => {
      const relativePath = path.relative(SOURCE_DIR, file).replace(/\\/g, '/')
      const remotePath = toRemotePath(config.remoteDir, relativePath)
      const remoteDir = path.posix.dirname(remotePath)

      try {
        if (!remoteDirs.has(remoteDir)) {
          await ensureRemoteDir(sftp, remoteDir)
          remoteDirs.add(remoteDir)
        }

        await uploadFile(sftp, file, remotePath)
        results.success++
        pc.update({ top: `✓ ${relativePath}`, bottom: progressText(results.success, results.failed, total) })
      } catch (error) {
        results.failed++
        results.errors.push({ file: relativePath, error: error.message })
        pc.update({ top: `✗ ${relativePath}`, bottom: progressText(results.success, results.failed, total) })
      }
    })()

    executing.push(promise)

    if (executing.length >= config.concurrency) {
      await Promise.race(executing)
      const settled = executing.map((p, i) => p.then(() => i).catch(() => i))
      const completedIndex = await Promise.race(settled)
      executing.splice(completedIndex, 1)
    }
  }

  await Promise.all(executing)
  pc.end() // 结束并清掉贴底进度块，让结尾统计滚到其上方，避免残留
  return results
}

async function main() {
  validateConfig()

  const files = getAllFiles(SOURCE_DIR)
  if (files.length === 0) {
    console.warn('⚠️  .output/server 目录为空，没有需要上传的文件')
    return
  }

  // 默认不上传 node_modules，统计被跳过的文件数用于提示
  let skippedNodeModules = 0
  if (!includeNodeModules) {
    const nmDir = path.join(SOURCE_DIR, 'node_modules')
    if (fs.existsSync(nmDir)) skippedNodeModules = countDirFiles(nmDir)
  }

  console.log('🚀 开始上传 .output/server 到服务器...\n')
  console.log(`📦 文件数量: ${files.length}`)
  if (skippedNodeModules > 0) {
    console.log(`⊘ 跳过 node_modules: ${skippedNodeModules} 个文件（加 --node-modules 可一并上传）`)
  }
  console.log(`📂 本地目录: ${SOURCE_DIR}`)
  console.log(`🌐 服务器: ${config.host}:${config.port}`)
  console.log(`📁 远程目录: ${config.remoteDir}`)
  console.log(`⚡ 并发数: ${config.concurrency}\n`)

  if (isDryRun) {
    console.log('🧪 Dry run：仅预览前 30 个文件，不连接服务器、不上传。')
    files.slice(0, 30).forEach(file => {
      const relativePath = path.relative(SOURCE_DIR, file).replace(/\\/g, '/')
      console.log(`  ${relativePath} -> ${toRemotePath(config.remoteDir, relativePath)}`)
    })
    if (files.length > 30) {
      console.log(`  ... 还有 ${files.length - 30} 个文件`)
    }
    return
  }

  const sftp = new SftpClient()

  try {
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
    })

    await ensureRemoteDir(sftp, config.remoteDir)
    const results = await concurrentUpload(sftp, files)

    console.log('\n' + '='.repeat(50))
    console.log('📊 上传完成统计:')
    console.log(`  成功: ${results.success} 个文件`)
    console.log(`  失败: ${results.failed} 个文件`)

    if (results.errors.length > 0) {
      console.log('\n❌ 失败的文件:')
      results.errors.forEach(({ file, error }) => {
        console.log(`  - ${file}: ${error}`)
      })
    }

    console.log('='.repeat(50))

    if (results.failed > 0) {
      process.exitCode = 1
    }
  } finally {
    await sftp.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error('❌ 上传失败:', error.message)
  process.exit(1)
})
