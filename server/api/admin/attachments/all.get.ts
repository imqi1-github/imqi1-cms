import type { Prisma } from '@prisma/client'

import prisma from '#server/utils/prisma'
import { normalizeAttachmentMetadata } from '#server/utils/attachmentMetadata'
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
    const where: Prisma.attachmentsWhereInput = {}

    if (type && type !== 'all') {
      where.type = type
    }

    if (search) {
      where.title = {
        contains: search,
      }
    }

    // 查询总数
    const total = await prisma.attachments.count({ where })

    // 查询附件列表
    const attachments = await prisma.attachments.findMany({
      where,
      orderBy: { aid: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        posts: {
          select: {
            post: {
              select: {
                cid: true,
                title: true,
              },
            },
          },
        },
      },
    })

    return {
      success: true,
      data: {
        list: attachments.map(a => {
          const metadata = normalizeAttachmentMetadata(a.metadata)
          return {
            id: a.aid,
            name: a.title,
            type: a.type,
            url: a.url,
            size: metadata.size,
            metadata,
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            createTime: a.create_time,
            posts: a.posts.map(relation => relation.post),
          }
        }),
        total,
        page,
        pageSize,
      },
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: (error instanceof Error ? error.message : String(error)) || '获取附件列表失败',
    })
  }
})
