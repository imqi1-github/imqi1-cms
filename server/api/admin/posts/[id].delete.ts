import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少文章 ID',
    })
  }

  try {
    await prisma.post.delete({
      where: { cid: Number(id) },
    })
    return { success: true }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '删除文章失败',
    })
  }
})
