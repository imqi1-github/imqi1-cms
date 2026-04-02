import prisma from '~/server/utils/prisma'

export default defineEventHandler(async () => {
  try {
    const [postsCount, commentsCount, categoriesCount, usersCount] = await Promise.all([
      prisma.post.count(),
      prisma.comment.count(),
      prisma.category.count(),
      prisma.user.count(),
    ])

    return {
      posts: postsCount,
      comments: commentsCount,
      categories: categoriesCount,
      users: usersCount,
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '获取统计数据失败',
    })
  }
})
