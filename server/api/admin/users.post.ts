import prisma from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  try {
    const user = await prisma.user.create({
      data: {
        name: body.name,
        mail: body.mail,
        password: body.password, // TODO: 使用 bcrypt 等库进行哈希
        role: body.role || 0,
      },
    })
    return user
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '创建用户失败',
    })
  }
})
