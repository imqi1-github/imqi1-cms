import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async () => {
  try {
    const users = await prisma.user.findMany()
    return users
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '获取用户列表失败',
    })
  }
})
