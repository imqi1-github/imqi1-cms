import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少链接 ID',
    })
  }

  try {
    const link = await prisma.link.findUnique({
      where: { id: Number(id) },
    })

    if (!link) {
      throw createError({
        statusCode: 404,
        message: '链接不存在',
      })
    }

    const updated = await prisma.link.update({
      where: { id: Number(id) },
      data: { enabled: !link.enabled },
    })
    return updated
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '更新链接失败',
    })
  }
})
