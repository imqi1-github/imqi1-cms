import prisma from '#server/utils/prisma'
import { getUser } from '#server/lib/auth'
import * as fs from 'fs'
import * as path from 'path'

export default defineEventHandler(async event => {
  try {
    const user = await getUser(event)
    if (!user) {
      throw createError({
        statusCode: 401,
        message: '未登录',
      })
    }

    const id = Number(getRouterParam(event, 'id'))

    if (!id) {
      throw createError({
        statusCode: 400,
        message: '无效的附件 ID',
      })
    }

    const attachment = await prisma.attachments.findUnique({
      where: { aid: id },
      include: {
        posts: {
          select: {
            cid: true,
            title: true,
            slug: true,
          },
        },
      },
    })

    if (!attachment) {
      throw createError({
        statusCode: 404,
        message: '附件不存在',
      })
    }

    // 获取文件信息
    let fileSize = 0
    let width: number | null = null
    let height: number | null = null
    let format: string | null = null

    const filePath = path.join(process.cwd(), 'public', attachment.url)
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      fileSize = stats.size

      // 尝试获取图片尺寸
      if (attachment.type === 'image') {
        try {
          // 简单的格式检测
          const ext = path.extname(filePath).toLowerCase()
          format = ext.slice(1)
        } catch {
          // 忽略错误
        }
      }
    }

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
        type: attachment.type,
        url: attachment.url,
        size: fileSize,
        width,
        height,
        format,
        createdAt: attachment.create_time,
        post: attachment.posts,
      },
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || '获取附件详情失败',
    })
  }
})
