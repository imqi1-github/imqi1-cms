import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async () => {
  try {
    const changelogs = await prisma.changelog.findMany({
      orderBy: { create_time: 'desc' },
    })
    return changelogs
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '获取更新日志失败',
    })
  }
})
