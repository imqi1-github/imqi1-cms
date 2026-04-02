import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少订阅 ID',
    })
  }

  try {
    await prisma.subscribe.delete({
      where: { id: Number(id) },
    })
    return { success: true }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '删除订阅失败',
    })
  }
})
