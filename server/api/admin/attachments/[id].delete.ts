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

    const attachmentId = Number(getRouterParam(event, 'id'))

    if (!attachmentId) {
      throw createError({
        statusCode: 400,
        message: '无效的附件 ID',
      })
    }

    // 获取附件信息
    const attachment = await prisma.attachment.findUnique({
      where: { aid: attachmentId },
    })

    if (!attachment) {
      throw createError({
        statusCode: 404,
        message: '附件不存在',
      })
    }

    // 删除物理文件
    const filePath = path.join(process.cwd(), 'public', attachment.url)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (err) {
        console.error('删除文件失败:', err)
      }
    }

    // 删除数据库记录
    await prisma.attachment.delete({
      where: { aid: attachmentId },
    })

    return {
      success: true,
      message: '删除成功',
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || '删除失败',
    })
  }
})
