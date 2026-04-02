import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  try {
    const changelog = await prisma.changelog.create({
      data: {
        class: body.class,
        desc: body.desc,
      },
    })
    return changelog
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '创建更新日志失败',
    })
  }
})
