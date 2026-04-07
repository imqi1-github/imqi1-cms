import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import dotenv from 'dotenv'
import readline from 'readline'

// 使用 createRequire 来导入 CommonJS 模块
const require = createRequire(import.meta.url)
const SftpClient = require('ssh2-sftp-client')

// 加载环境变量
dotenv.config()

// 创建 readline 接口用于用户交互
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.resolve(__dirname, '..')
const BASE_DIR = path.join(ROOT_DIR, '.output', 'server')

// 从命令行参数获取子目录
const args = process.argv.slice(2)
const subDir = args.find(arg => !arg.startsWith('-'))

// 如果提供了子目录，则上传指定子目录；否则上传整个 server 目录
const SOURCE_DIR = subDir
  ? path.join(BASE_DIR, subDir)
  : BASE_DIR

// SSH 配置
const sshConfig = {
  host: process.env.UBUNTU_HOST,
  port: parseInt(process.env.UBUNTU_PORT || '22'),
  username: process.env.UBUNTU_USERNAME,
  password: process.env.UBUNTU_PASSWORD,
  privateKey: process.env.UBUNTU_PRIVATE_KEY_PATH,
  passphrase: process.env.UBUNTU_PASSPHRASE,
}

// 上传目标目录
const TARGET_DIR = process.env.UBUNTU_TARGET_DIR || '/var/www/html'

// 并发数
const CONCURRENCY = parseInt(process.env.UBUNTU_CONCURRENCY || '5')

// 检查配置
if (!sshConfig.host || !sshConfig.username) {
  console.error('❌ 缺少必要的 SSH 配置')
  console.error('请在 .env 文件中配置以下变量：')
  console.error('  - UBUNTU_HOST')
  console.error('  - UBUNTU_USERNAME')
  console.error('  - UBUNTU_PASSWORD 或 UBUNTU_PRIVATE_KEY_PATH')
  process.exit(1)
}

// 递归获取目录下所有文件
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath)

  files.forEach(file => {
    const filePath = path.join(dirPath, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles)
    } else {
      arrayOfFiles.push(filePath)
    }
  })

  return arrayOfFiles
}

// 确保远程目录存在
async function ensureRemoteDir(sftp, remotePath) {
  try {
    await sftp.mkdir(remotePath, true)
  } catch (error) {
    // 目录可能已存在，忽略错误
    if (!error.message.includes('exists')) {
      throw error
    }
  }
}

// 上传单个文件（带重试）
async function uploadFile(sftp, localPath, remotePath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await sftp.fastPut(localPath, remotePath)
      return true
    } catch (error) {
      if (i === retries - 1) {
        throw error
      }

      // 指数退避
      const delay = Math.min(1000 * Math.pow(2, i), 5000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return false
}

// 询问用户确认
function askQuestion(query) {
  return new Promise(resolve => {
    rl.question(query, (answer) => {
      resolve(answer.toLowerCase())
    })
  })
}

// 递归获取远程目录中的所有文件
async function getRemoteFiles(sftp, remotePath) {
  const files = []

  try {
    const result = await sftp.list(remotePath)

    for (const item of result) {
      const fullPath = path.posix.join(remotePath, item.name)

      if (item.type === 'd') {
        // 递归获取子目录文件
        const subFiles = await getRemoteFiles(sftp, fullPath)
        files.push(...subFiles)
      } else {
        files.push(fullPath)
      }
    }
  } catch (error) {
    // 目录可能不存在，返回空数组
    if (!error.message.includes('No such file')) {
      throw error
    }
  }

  return files
}

// 删除远程目录中的所有文件
async function clearRemoteDirectory(sftp, remotePath) {
  try {
    console.log('\n🔍 正在检查远程目录...\n')

    const remoteFiles = await getRemoteFiles(sftp, remotePath)

    if (remoteFiles.length === 0) {
      console.log('✅ 远程目录为空，无需清空\n')
      return true
    }

    console.log(`📁 远程目录中有 ${remoteFiles.length} 个文件：\n`)

    // 显示前20个文件
    const previewFiles = remoteFiles.slice(0, 20)
    previewFiles.forEach(file => {
      console.log(`  - ${file}`)
    })

    if (remoteFiles.length > 20) {
      console.log(`  ... 还有 ${remoteFiles.length - 20} 个文件\n`)
    } else {
      console.log('')
    }

    const answer = await askQuestion('⚠️  是否要清空远程目录中的所有文件？(yes/no): ')

    if (answer === 'yes' || answer === 'y') {
      console.log('\n🗑️  正在清空远程目录...')

      // 删除所有文件
      for (const file of remoteFiles) {
        try {
          await sftp.delete(file)
        } catch (error) {
          console.log(`⚠️  删除失败: ${file}`)
        }
      }

      // 尝试删除空目录
      try {
        const dirs = [...new Set(remoteFiles.map(f => path.posix.dirname(f)))]
        for (const dir of dirs.reverse()) {
          try {
            await sftp.rmdir(dir)
          } catch {
            // 忽略删除目录失败
          }
        }
      } catch {
        // 忽略
      }

      console.log('✅ 远程目录已清空\n')
      return true
    } else {
      console.log('❌ 已取消清空操作\n')
      return false
    }
  } catch (error) {
    console.error(`❌ 清空远程目录失败: ${error.message}\n`)
    return false
  }
}

// 并发上传函数
async function concurrentUpload(sftp, files, concurrency = 5) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  }

  const executing = []

  for (const file of files) {
    const promise = (async () => {
      const relativePath = path.relative(SOURCE_DIR, file).replace(/\\/g, '/')
      const remotePath = path.posix.join(TARGET_DIR, relativePath)

      try {
        // 确保远程目录存在
        const remoteDir = path.posix.dirname(remotePath)
        await ensureRemoteDir(sftp, remoteDir)

        await uploadFile(sftp, file, remotePath, 3)
        console.log(`✓ ${relativePath}`)
        results.success++
      } catch (error) {
        console.log(`✗ ${relativePath}`)
        results.failed++
        results.errors.push({ file: relativePath, error: error.message })
      }
    })()

    executing.push(promise)

    // 控制并发数量
    if (executing.length >= concurrency) {
      await Promise.race(executing)
      // 移除已完成的 promise
      const settled = executing.map((p, i) =>
        p.then(() => i).catch(() => i)
      )
      const completedIndex = await Promise.race(settled)
      executing.splice(completedIndex, 1)
    }
  }

  // 等待所有剩余任务完成
  await Promise.all(executing)

  return results
}

// 主函数
async function main() {
  console.log('🚀 开始上传文件到 Ubuntu 服务器...\n')

  // 检查源目录是否存在
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ 源目录不存在: ${SOURCE_DIR}`)
    console.error('请先运行构建命令: bun run build')
    rl.close()
    process.exit(1)
  }

  // 获取所有文件
  const files = getAllFiles(SOURCE_DIR)

  if (files.length === 0) {
    console.warn('⚠️  没有找到需要上传的文件')
    rl.close()
    return
  }

  console.log(`📦 找到 ${files.length} 个文件`)
  console.log(`📂 上传目录: ${SOURCE_DIR}`)
  console.log(`🌐 目标服务器: ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`)
  console.log(`📁 目标目录: ${TARGET_DIR}`)
  console.log(`⚡ 使用并发上传（并发数: ${CONCURRENCY}）`)

  const sftp = new SftpClient()

  try {
    // 连接服务器
    console.log('\n🔌 正在连接服务器...')
    await sftp.connect(sshConfig)
    console.log('✅ 连接成功')

    // 清空远程目录
    const shouldContinue = await clearRemoteDirectory(sftp, TARGET_DIR)

    if (!shouldContinue) {
      console.log('❌ 上传已取消')
      await sftp.end()
      rl.close()
      process.exit(0)
    }

    console.log('📤 开始上传文件...\n')

    // 开始上传
    const results = await concurrentUpload(sftp, files, CONCURRENCY)

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
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ 发生错误:', error.message)
    rl.close()
    process.exit(1)
  } finally {
    await sftp.end()
    console.log('\n👋 连接已关闭')
    rl.close()
  }
}

main().catch((error) => {
  console.error('❌ 发生错误:', error.message)
  rl.close()
  process.exit(1)
})
