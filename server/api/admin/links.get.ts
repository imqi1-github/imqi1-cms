import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async () => {
  try {
    const links = await prisma.link.findMany()
    return links
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '获取链接列表失败',
    })
  }
})
