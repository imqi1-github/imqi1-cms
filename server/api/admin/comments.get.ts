import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async () => {
  try {
    const comments = await prisma.comment.findMany({
      orderBy: { create_time: 'desc' },
    })
    return comments
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '获取评论列表失败',
    })
  }
})
