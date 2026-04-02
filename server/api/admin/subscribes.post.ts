import prisma from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  try {
    const subscribe = await prisma.subscribe.create({
      data: {
        name: body.name,
        url: body.url,
        avatar: body.avatar || null,
      },
    })
    return subscribe
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '创建订阅失败',
    })
  }
})
