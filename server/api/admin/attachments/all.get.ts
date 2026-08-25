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
    // page/pageSize 只钳下限不设上限：超大 pageSize 会 take 全表、超大 page 会慢 LIMIT OFFSET；加 floor + 上限
    const page = Math.min(10000, Math.max(1, Math.floor(Number(query.page) || 1)))
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 20)))
    // query 对重复参数（?type=a&type=b）会返回数组，仅 as string 会让数组流入 Prisma where 抛错；typeof 收窄
    const type = typeof query.type === 'string' ? query.type : undefined
    const search = typeof query.search === 'string' ? query.search : undefined

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
      select: {
        aid: true,
        title: true,
        type: true,
        url: true,
        metadata: true,
        create_time: true,
        contentattachments: {
          select: {
            content: {
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
            contents: a.contentattachments.map(relation => relation.content),
          }
        }),
        total,
        page,
        pageSize,
      },
    }
  } catch (error) {
    // 已知 401/400/404 等带 statusCode 的错误先行重抛，避免 console.error 打印预期 4xx 的完整堆栈
    if (error instanceof Error && 'statusCode' in error) {
      throw error
    }
    console.error(error)
    throw createError({
      statusCode: 500,
      message: (error instanceof Error ? error.message : String(error)) || '获取附件列表失败',
    })
  }
})
