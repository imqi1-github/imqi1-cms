import prisma from '#server/utils/prisma'
import { getUser } from '#server/lib/auth'
import { deleteFromUpYun } from '#server/utils/upyun'
import { deleteFromCOS, type DeleteResult as CosDeleteResult } from '#server/utils/cos'
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

    // 获取附件信息
    const attachment = await prisma.attachment.findUnique({
      where: { aid: id },
    })

    if (!attachment) {
      throw createError({
        statusCode: 404,
        message: '附件不存在',
      })
    }

    // 根据存储位置删除文件
    if (attachment.storage === 'upyun') {
      // 删除又拍云文件
      const deleted = await deleteFromUpYun(attachment.url)
      if (!deleted) {
        console.error('删除又拍云文件失败:', attachment.url)
      }
    } else if (attachment.storage === 'cos') {
      // 删除腾讯云COS文件
      const result = await deleteFromCOS(attachment.url)
      if (!result.success) {
        console.error('删除COS文件失败:', result.error)
      }
    } else {
      // 删除本地文件
      const filePath = path.join(process.cwd(), 'public', attachment.url)
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath)
        } catch (err) {
          console.error('删除本地文件失败:', err)
        }
      }
    }

    // 删除数据库记录
    await prisma.attachment.delete({
      where: { aid: id },
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
