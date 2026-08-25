import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateCommentData } from "#server/utils/validation";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少评论 ID",
    });
  }
  const coid = Number(id);
  if (!Number.isInteger(coid) || coid <= 0) {
    throw createError({
      statusCode: 400,
      message: "评论 ID 非法",
    });
  }

  // readBody 对空/非对象 body 会返回 undefined，解构 null/undefined 抛 TypeError；兜底空对象
  const body = (await readBody(event)) ?? {};
  const { csrfToken, name, mail, link, content, status } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 验证字段长度（name/mail/link 为 string 时才校验，避免非字符串流入 validateCommentData）
  if (name !== undefined || mail !== undefined || link !== undefined) {
    validateCommentData({ name, mail, link });
  }

  // status 未做校验会以任意值写入 Int 字段：字符串 "1" 会让计数逻辑走错分支、越界值触发 Prisma 校验错误；
  // 统一归一化为合法枚举（0/1/2），非法抛 400
  let normalizedStatus: number | undefined;
  if (status !== undefined) {
    const s = Number(status);
    if (!Number.isInteger(s) || ![0, 1, 2].includes(s)) {
      throw createError({
        statusCode: 400,
        message: "评论状态非法",
      });
    }
    normalizedStatus = s;
  }

  try {
    // 更新评论 + 状态变化时的文章计数更新需同事务：否则状态已改、计数没跟上（或相反）产生脏数据
    const comment = await prisma.$transaction(async tx => {
      // 获取原评论信息（用于比较状态变化）
      const oldComment = await tx.comments.findUnique({
        where: { coid },
        select: { coid: true, cid: true, status: true },
      });

      if (!oldComment) {
        throw createError({
          statusCode: 404,
          message: "评论不存在",
        });
      }

      const updated = await tx.comments.update({
        where: { coid },
        data: {
          ...(name !== undefined && { name }),
          ...(mail !== undefined && { mail }),
          ...(link !== undefined && { link }),
          ...(content !== undefined && { content }),
          ...(normalizedStatus !== undefined && { status: normalizedStatus }),
        },
        // 约定1 白名单：update 默认返回全部列（含 ip/agent/mail 等内部/隐私字段），只回传必要字段
        select: {
          coid: true,
          cid: true,
          name: true,
          link: true,
          content: true,
          create_time: true,
          status: true,
          parent_id: true,
          content_ref: {
            select: {
              cid: true,
              title: true,
              slug: true,
            },
          },
        },
      });

      // 如果状态发生变化，更新文章评论计数
      if (normalizedStatus !== undefined && normalizedStatus !== oldComment.status) {
        // 从非已发布变为已发布：增加计数
        if (normalizedStatus === 1 && oldComment.status !== 1) {
          await tx.contents.update({
            where: { cid: oldComment.cid },
            data: { comment_num: { increment: 1 } },
          });
        }
        // 从已发布变为非已发布：减少计数
        else if (normalizedStatus !== 1 && oldComment.status === 1) {
          await tx.contents.update({
            where: { cid: oldComment.cid },
            data: { comment_num: { decrement: 1 } },
          });
        }
      }

      return updated;
    });

    return {
      success: true,
      data: comment,
    };
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    console.error(error);
    // 计数 update 时文章已被删 / 评论更新竞态被删 → P2025 → 404 而非 500
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        message: "评论不存在或已被删除",
      });
    }
    throw createError({
      statusCode: 500,
      message: "更新评论失败",
    });
  }
});
