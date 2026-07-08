import prisma from '#server/utils/prisma'
import { getUser } from '#server/lib/auth'
import { validateAttachmentData } from '#server/utils/validation'

export default defineEventHandler(async event => {
  try {
    const user = await getUser(event)
    if (!user) {
      throw createError({
        statusCode: 401,
        message: '未登录',
      })
    }

    const id = Number(getRouterParam(event, 'id'))
    const body = await readBody(event)

    if (!id) {
      throw createError({
        statusCode: 400,
        message: '无效的附件 ID',
      })
    }

    // 检查附件是否存在
    const existing = await prisma.attachments.findUnique({
      where: { aid: id },
    })

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: '附件不存在',
      })
    }

    // 验证字段长度
    validateAttachmentData({
      title: body.name,
      type: existing.type,
      url: existing.url,
    })

    const cidList: number[] | null = body.cids !== undefined
      ? (Array.isArray(body.cids)
          ? Array.from(new Set(body.cids.map((cid: unknown) => Number(cid)).filter(Number.isInteger)))
          : [])
      : null

    // 更新附件
    const attachment = await prisma.$transaction(async tx => {
      const updated = await tx.attachments.update({
        where: { aid: id },
        data: {
          title: body.name,
        },
      })

      if (cidList !== null) {
        await tx.contentattachments.deleteMany({ where: { aid: id } })
        if (cidList.length > 0) {
          await tx.contentattachments.createMany({
            data: cidList.map(cid => ({ aid: id, cid })),
            skipDuplicates: true,
          })
        }
      }

      return updated
    })

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
      },
    }
  } catch (error) {
    console.error(error)
    if (error instanceof Error && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: (error instanceof Error ? error.message : String(error)) || '更新附件失败',
    })
  }
})
