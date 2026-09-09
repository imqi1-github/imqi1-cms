import prisma from '#server/utils/prisma'
import { getUser } from '#server/lib/auth'
import { validateCsrfToken } from '#server/utils/csrf'
import { invalidateContentCaches } from '#server/utils/content-cache'
import { validateAttachmentData } from '#server/utils/validation'

export default defineEventHandler(async event => {
  // 鉴权与 CSRF 放在 try 块外：这两条安全不变式不应进入会吞错的 catch
  const user = await getUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: '未登录',
    })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      message: '无效的附件 ID',
    })
  }

  const body = (await readBody(event)) ?? {}
  const { csrfToken } = body

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: 'CSRF token 验证失败，请刷新页面重试',
    })
  }

  try {
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

    // body.name 若非字符串：长度校验会因 value.length 为 undefined/数值而绕过，写入 Prisma 会打挂成 500；先收窄类型
    const title = typeof body.name === 'string' ? body.name : ''

    // 验证字段长度
    validateAttachmentData({
      title,
      type: existing.type,
      url: existing.url,
    })

    const cidList: number[] | null = body.cids !== undefined
      ? (Array.isArray(body.cids)
          ? (() => {
              const nums: number[] = body.cids.map((cid: unknown) => Number(cid))
              // 任一元素非正整数 → 400：否则非数组/含非法元素的 cids 会被清成 []，静默清空该附件全部关联
              if (nums.some(n => !Number.isInteger(n) || n <= 0)) {
                throw createError({ statusCode: 400, message: 'cids 格式错误' })
              }
              return Array.from(new Set(nums))
            })()
          : (() => {
              throw createError({ statusCode: 400, message: 'cids 格式错误' })
            })())
      : null

    // 更新附件
    const attachment = await prisma.$transaction(async tx => {
      const updated = await tx.attachments.update({
        where: { aid: id },
        data: {
          title,
        },
      })

      if (cidList !== null) {
        await tx.contentattachments.deleteMany({ where: { aid: id } })
        if (cidList.length > 0) {
          // createMany 的 skipDuplicates 只跳复合主键重复，不含外键约束：cid 不存在时抛 P2003 → 应在 catch 映射为 400
          await tx.contentattachments.createMany({
            data: cidList.map(cid => ({ aid: id, cid })),
            skipDuplicates: true,
          })
        }
      }

      return updated
    })

    // 附件标题/关联变更 → 影响相关文章详情 /content/** 渲染
    void invalidateContentCaches({ routes: ['/content/**'] }).catch(err => console.error('[cache] 附件更新失效缓存失败', err))

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
    // cids 关联到不存在的 content → 外键 P2003，语义上应为 400
    if (error instanceof Error && 'code' in error && error.code === 'P2003') {
      throw createError({
        statusCode: 400,
        message: '存在无效的关联内容',
      })
    }

    throw createError({
      statusCode: 500,
      message: '更新附件失败',
    })
  }
})
