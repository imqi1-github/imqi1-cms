import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import readline from 'readline'

import dotenv from 'dotenv'

import { ProgressConsole } from './lib/progress.mjs'

// 使用 createRequire 来导入 CommonJS 模块
const require = createRequire(import.meta.url)
const COS = require('cos-nodejs-sdk-v5')

// 加载环境变量（锚定仓库根 .env，勿依赖调用 cwd——脚本可能从任意目录运行）
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

// 创建 readline 接口用于用户交互
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.resolve(__dirname, '..')
const BASE_DIR = path.join(ROOT_DIR, '.output', 'public')

// 读取构建 hash 目录(由 nuxt.config 的 build:done hook 写入 .output/build-hash.json,dir 形如 static/<hash>)
// 未指定子目录时强制要求此文件，确保上传目标目录精确可控
let buildHashPrefix = ''
let hasBuildHashFile = false
try {
  const buildInfoPath = path.join(ROOT_DIR, '.output', 'build-hash.json')
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'))
  buildHashPrefix = buildInfo.dir || ''
  hasBuildHashFile = true
  console.log(`📦 Build hash: ${buildHashPrefix}\n`)
} catch {
  // build-hash.json 不存在，仅当指定子目录时允许（静态资源走独立路径）
}

// 从命令行参数获取子目录
const args = process.argv.slice(2)
const subDir = args.find(arg => !arg.startsWith('-'))

// 指定子目录时只上传该子目录；
// 未指定时默认上传扁平化后的构建产物（构建产物直接位于 public 根目录，带构建 hash）。
// imgs/skills/icons/emojis 等静态资源不走构建 hash，不在此上传。
const SOURCE_DIR = subDir
  ? path.join(BASE_DIR, subDir)
  : BASE_DIR

// 构建产物扁平化后直接位于 public 根目录（nuxt.config.ts 的 buildAssetsDir: "/"），
// 默认上传项 = 根目录的构建 chunk（.js/.css 及 .br/.gz 变体）+ builds/ 懒加载元数据。
// 不包含 manifest.webmanifest（HTML/链接指向 CDN 根，由镜像回源提供，无需上传到 hash 目录）
// 与 sw.js（静态入口，同样由回源提供）。
// 注：workbox 运行时已内联进 sw.js（inlineWorkboxRuntime），不再有独立 workbox-*.js 文件
const STATIC_DIRS_RE = /^(?:imgs|fonts|icons|skills|emojis|uploads)\//
const BUILD_ASSET_RE = /^builds\//
const BUILD_CHUNK_RE = /\.(?:js|css)(?:\.(?:br|gz))?$/

function isBuildAsset(relativePath) {
  if (STATIC_DIRS_RE.test(relativePath)) return false // 静态资源目录（font.css 等）不走 hash 目录
  if (BUILD_ASSET_RE.test(relativePath)) return true
  if (!BUILD_CHUNK_RE.test(relativePath)) return false
  if (relativePath === 'sw.js') return false // sw.js 是静态入口，不走 hash 目录
  return true
}

function collectDefaultFiles() {
  return getAllFiles(BASE_DIR).filter(file => {
    const relativePath = path.relative(BASE_DIR, file).replace(/\\/g, '/')
    return isBuildAsset(relativePath)
  })
}

// COS 配置
const cosConfig = {
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
  Bucket: process.env.COS_BUCKET,
  Region: process.env.COS_REGION,
}

// 上传路径前缀：构建 hash 目录 + 环境变量前缀
const UPLOAD_PREFIX = buildHashPrefix || process.env.COS_PREFIX || ''

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

// 获取远程目录中的所有文件（自动翻页，MaxKeys=1000 一页，直到 IsTruncated=false）
async function getRemoteFiles(prefix = '') {
  const all = []
  let marker = ''
  do {
    const data = await new Promise((resolve, reject) => {
      cos.getBucket({
        Bucket: cosConfig.Bucket,
        Region: cosConfig.Region,
        Prefix: prefix,
        Marker: marker,
        MaxKeys: 1000
      }, (err, d) => {
        if (err) reject(err)
        else resolve(d)
      })
    })
    all.push(...(data.Contents || []))
    // 有更多页时用 NextMarker 续取
    if (!data.IsTruncated) break
    marker = data.NextMarker || ''
  } while (marker)
  return all
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
      }, (err) => {
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
    // 守卫:未确定清空范围(构建 hash 与 COS_PREFIX 都为空)时,拒绝清空整个 bucket。
    // 否则 Prefix='' 会列出并删除全部对象(不可逆)。
    if (!UPLOAD_PREFIX) {
      console.error('❌ 未确定清空范围(UPLOAD_PREFIX 为空):拒绝清空整个 COS bucket。')
      console.error('   请链接 .output/build-hash.json,或用 -- 传 COS_PREFIX 指定子前缀。')
      return false
    }

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
async function concurrentUpload(files, concurrency = parseInt(process.env.COS_CONCURRENCY) || 15) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  }

  const executing = []
  const pc = new ProgressConsole()
  const total = files.length

  for (const file of files) {
    const promise = (async () => {
      // 始终从 BASE_DIR 计算相对路径，保留子目录前缀（如 _nuxt/）
      const relativePath = path.relative(BASE_DIR, file).replace(/\\/g, '/')
      const remotePath = UPLOAD_PREFIX ? `${UPLOAD_PREFIX}/${relativePath}` : relativePath

      try {
        await uploadFile(file, remotePath)
        results.success++
        pc.update({ top: `✓ ${relativePath}`, bar: { success: results.success, failed: results.failed, total } })
      } catch (error) {
        results.failed++
        results.errors.push({ file: relativePath, error: error.message })
        pc.update({ top: `✗ ${relativePath}`, bar: { success: results.success, failed: results.failed, total } })
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
  pc.end() // 结束并清掉贴底进度块，让结尾统计滚到其上方，避免残留

  return results
}

// 主函数
async function main() {
  console.log('🚀 开始上传文件到腾讯云 COS...\n')

  // 未指定子目录时，必须有 build-hash.json（构建产物走 hash 目录，不允许裸上传 public 根目录）
  if (!subDir && !hasBuildHashFile) {
    console.error('❌ 未找到 .output/build-hash.json')
    console.error('   构建产物（.js/.css）必须通过 hash 目录上传，不允许裸上传 public 根目录。')
    console.error('   请先完成构建: bun run build')
    rl.close()
    process.exit(1)
  }

  // 获取所有文件
  let files
  if (subDir) {
    // 指定子目录：检查存在性后递归收集
    if (!fs.existsSync(SOURCE_DIR)) {
      console.error(`❌ 源目录不存在: ${SOURCE_DIR}`)
      console.error('请先运行构建命令: bun run build')
      rl.close()
      process.exit(1)
    }
    files = getAllFiles(SOURCE_DIR)
  } else {
    // 默认：收集扁平化构建产物（public 根目录，不含 manifest）
    files = collectDefaultFiles()
  }

  if (files.length === 0) {
    console.warn('⚠️  没有找到需要上传的文件')
    rl.close()
    return
  }

  console.log(`📦 找到 ${files.length} 个文件`)
  console.log(`📂 来源: ${subDir ? SOURCE_DIR : '构建产物（public 根目录，不含 manifest）'}`)
  console.log(`⚡ 使用并发上传（并发数: ${process.env.COS_CONCURRENCY || 15}）`)

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
