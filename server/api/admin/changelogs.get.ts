import prisma from '~/server/utils/prisma'

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
