import prisma from '#server/utils/prisma'
import { getUser } from '#server/lib/auth'

export default defineEventHandler(async event => {
  try {
    const user = await getUser(event)
    if (!user) {
      throw createError({
        statusCode: 401,
        message: '未登录',
      })
    }

    const query = getQuery(event)
    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 20
    const type = query.type as string | undefined
    const search = query.search as string | undefined

    // 构建查询条件
    const where: any = {}

    if (type && type !== 'all') {
      where.type = type
    }

    if (search) {
      where.title = {
        contains: search,
      }
    }

    // 查询总数
    const total = await prisma.attachment.count({ where })

    // 查询附件列表
    const attachments = await prisma.attachment.findMany({
      where,
      orderBy: { create_time: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        post: {
          select: {
            cid: true,
            title: true,
          },
        },
      },
    })

    return {
      success: true,
      data: {
        list: attachments.map(a => ({
          id: a.aid,
          name: a.title,
          type: a.type,
          url: a.url,
          size: '-', // 暂不支持文件大小
          createTime: a.create_time,
          post: a.post,
        })),
        total,
        page,
        pageSize,
      },
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || '获取附件列表失败',
    })
  }
})
