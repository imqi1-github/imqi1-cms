import prisma from '~/server/utils/prisma'

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
