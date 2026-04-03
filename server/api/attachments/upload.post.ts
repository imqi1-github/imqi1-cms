import prisma from '#server/utils/prisma'
import { getUser } from '#server/lib/auth'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

// 允许的文件类型
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm']
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES]

// 最大文件大小 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// 上传目录
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

// 确保上传目录存在
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}

// 生成唯一文件名
function generateFileName(originalName: string): string {
  const ext = path.extname(originalName)
  const uuid = randomUUID()
  const date = new Date().toISOString().split('T')[0]
  return `${date}-${uuid}${ext}`
}

// 获取文件类型分类
function getFileCategory(mimeType: string): 'image' | 'video' {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image'
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video'
  return 'image' // 默认
}

export default defineEventHandler(async event => {
  try {
    // 检查是否登录
    const user = await getUser(event)
    if (!user) {
      throw createError({
        statusCode: 401,
        message: '未登录',
      })
    }

    // 获取文章 ID
    const cid = Number(getQuery(event).cid)

    if (!cid) {
      throw createError({
        statusCode: 400,
        message: '缺少文章 ID',
      })
    }

    // 检查文章是否存在
    const post = await prisma.post.findUnique({
      where: { cid },
    })

    if (!post) {
      throw createError({
        statusCode: 404,
        message: '文章不存在',
      })
    }

    // 读取表单数据
    const formData = await readFormData(event)
    const file = formData.get('file') as File

    if (!file) {
      throw createError({
        statusCode: 400,
        message: '未选择文件',
      })
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw createError({
        statusCode: 400,
        message: `不支持的文件类型: ${file.type}`,
      })
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 400,
        message: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024 }MB)`,
      })
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 生成文件名并保存
    ensureUploadDir()
    const fileName = generateFileName(file.name)
    const filePath = path.join(UPLOAD_DIR, fileName)

    fs.writeFileSync(filePath, buffer)

    // 生成访问 URL
    const fileUrl = `/uploads/${fileName}`

    // 保存到数据库
    const category = getFileCategory(file.type)
    const attachment = await prisma.attachment.create({
      data: {
        cid,
        type: category,
        title: file.name,
        url: fileUrl,
      },
    })

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
        type: attachment.type,
        url: attachment.url,
        size: formatFileSize(file.size),
        create_time: attachment.create_time,
      },
    }
  } catch (error: any) {
    // 如果是已知的错误，直接抛出
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || '上传失败',
    })
  }
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
