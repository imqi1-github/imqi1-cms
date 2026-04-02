import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少评论 ID',
    })
  }

  try {
    await prisma.comment.delete({
      where: { coid: Number(id) },
    })
    return { success: true }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '删除评论失败',
    })
  }
})
