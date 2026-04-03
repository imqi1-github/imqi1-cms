import prisma from '#server/utils/prisma'
import { getUser } from '#server/lib/auth'

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
    const body = await readBody(event)

    if (!id) {
      throw createError({
        statusCode: 400,
        message: '无效的附件 ID',
      })
    }

    // 检查附件是否存在
    const existing = await prisma.attachment.findUnique({
      where: { aid: id },
    })

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: '附件不存在',
      })
    }

    // 更新附件
    const attachment = await prisma.attachment.update({
      where: { aid: id },
      data: {
        title: body.name,
      },
    })

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
      },
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || '更新附件失败',
    })
  }
})
