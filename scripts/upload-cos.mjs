import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import dotenv from 'dotenv'
import readline from 'readline'

// 使用 createRequire 来导入 CommonJS 模块
const require = createRequire(import.meta.url)
const COS = require('cos-nodejs-sdk-v5')

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
const BASE_DIR = path.join(ROOT_DIR, '.output', 'public')

// 从命令行参数获取子目录
const args = process.argv.slice(2)
const subDir = args.find(arg => !arg.startsWith('-'))

// 如果提供了子目录，则上传指定子目录；否则上传整个 public 目录
const SOURCE_DIR = subDir
  ? path.join(BASE_DIR, subDir)
  : BASE_DIR

// COS 配置
const cosConfig = {
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
  Bucket: process.env.COS_BUCKET,
  Region: process.env.COS_REGION,
}

// 上传路径前缀（可选）
const UPLOAD_PREFIX = process.env.COS_PREFIX || ''

if (!cosConfig.SecretId || !cosConfig.SecretKey || !cosConfig.Bucket || !cosConfig.Region) {
  console.error('❌ 缺少必要的 COS 配置，请检查 .env 文件')
  console.error('需要配置: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION')
  process.exit(1)
}

// 初始化 COS 客户端
const cos = new COS({
  SecretId: cosConfig.SecretId,
  SecretKey: cosConfig.SecretKey,
})

// 递归获取所有文件
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir)

  files.forEach((file) => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList)
    } else {
      fileList.push(filePath)
    }
  })

  return fileList
}

// 上传单个文件（带重试）
async function uploadFile(localPath, remotePath, maxRetries = 3) {
  let lastError

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        cos.uploadFile(
          {
            Bucket: cosConfig.Bucket,
            Region: cosConfig.Region,
            Key: remotePath,
            FilePath: localPath,
          },
          (err, data) => {
            if (err) {
              reject(err)
            } else {
              resolve(data)
            }
          }
        )
      })
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        // 等待一段时间后重试（指数退避）
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// 获取远程目录中的所有文件
async function getRemoteFiles(prefix = '') {
  return new Promise((resolve, reject) => {
    cos.getBucket({
      Bucket: cosConfig.Bucket,
      Region: cosConfig.Region,
      Prefix: prefix,
      Marker: '',
      MaxKeys: 1000
    }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data.Contents || [])
      }
    })
  })
}

// 删除远程文件
async function deleteRemoteFiles(keys) {
  if (keys.length === 0) return []

  const deleteTasks = keys.map(key => {
    return new Promise((resolve, reject) => {
      cos.deleteObject({
        Bucket: cosConfig.Bucket,
        Region: cosConfig.Region,
        Key: key
      }, (err, data) => {
        if (err) reject({ key, error: err })
        else resolve({ key, success: true })
      })
    })
  })

  return Promise.all(deleteTasks)
}

// 询问用户确认
function askQuestion(query) {
  return new Promise(resolve => {
    rl.question(query, (answer) => {
      resolve(answer.toLowerCase())
    })
  })
}

// 清空远程目录
async function clearRemoteDirectory() {
  try {
    console.log('\n🔍 正在检查远程目录...\n')

    const remoteFiles = await getRemoteFiles(UPLOAD_PREFIX)

    if (remoteFiles.length === 0) {
      console.log('✅ 远程目录为空，无需清空\n')
      return true
    }

    console.log(`📁 远程目录中有 ${remoteFiles.length} 个文件：\n`)

    // 显示前20个文件
    const previewFiles = remoteFiles.slice(0, 20)
    previewFiles.forEach(file => {
      console.log(`  - ${file.Key}`)
    })

    if (remoteFiles.length > 20) {
      console.log(`  ... 还有 ${remoteFiles.length - 20} 个文件\n`)
    } else {
      console.log('')
    }

    const answer = await askQuestion('⚠️  是否要清空远程目录中的所有文件？(yes/no): ')

    if (answer === 'yes' || answer === 'y') {
      console.log('\n🗑️  正在清空远程目录...')

      const keys = remoteFiles.map(file => file.Key)
      const results = await deleteRemoteFiles(keys)

      const failed = results.filter(r => r.success !== true)
      if (failed.length > 0) {
        console.log(`⚠️  部分文件删除失败: ${failed.length} 个`)
      } else {
        console.log('✅ 远程目录已清空\n')
      }

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

// 并发控制函数
async function concurrentUpload(files, concurrency = parseInt(process.env.COS_CONCURRENCY) || 10) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  }

  const executing = []

  for (const file of files) {
    const promise = (async () => {
      const relativePath = path.relative(SOURCE_DIR, file).replace(/\\/g, '/')
      const remotePath = UPLOAD_PREFIX ? `${UPLOAD_PREFIX}/${relativePath}` : relativePath

      try {
        await uploadFile(file, remotePath)
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
  console.log('🚀 开始上传文件到腾讯云 COS...\n')

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
  console.log(`⚡ 使用并发上传（并发数: ${process.env.COS_CONCURRENCY || 10}）`)

  // 清空远程目录
  const shouldContinue = await clearRemoteDirectory()

  if (!shouldContinue) {
    console.log('❌ 上传已取消')
    rl.close()
    process.exit(0)
  }

  console.log('📤 开始上传文件...\n')

  const results = await concurrentUpload(files)

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

  rl.close()

  if (results.failed > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ 发生错误:', error.message)
  rl.close()
  process.exit(1)
})
