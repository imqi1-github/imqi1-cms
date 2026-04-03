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

    const query = getQuery(event)
    const cid = Number(query.cid)

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

    // 获取附件列表
    const attachments = await prisma.attachment.findMany({
      where: { cid },
      orderBy: { create_time: 'desc' },
    })

    return {
      success: true,
      data: attachments.map(a => ({
        id: a.aid,
        name: a.title,
        type: a.type,
        url: a.url,
        size: '-',
        create_time: a.create_time,
      })),
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: '获取附件列表失败',
    })
  }
})
