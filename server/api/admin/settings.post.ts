import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  try {
    const updates = [
      { key: 'siteName', value: body.siteName || '' },
      { key: 'siteDesc', value: body.siteDesc || '' },
      { key: 'siteKeywords', value: body.siteKeywords || '' },
      { key: 'siteIcp', value: body.siteIcp || '' },
      { key: 'commentEnabled', value: String(body.commentEnabled ?? true) },
      { key: 'commentModeration', value: String(body.commentModeration ?? false) }
    ]

    for (const update of updates) {
      await prisma.meta.upsert({
        where: { key: update.key },
        create: { key: update.key, value: update.value },
        update: { value: update.value }
      })
    }

    return { success: true }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '保存设置失败',
    })
  }
})
