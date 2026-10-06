import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateCommentData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { COMMENT_CACHE_ROUTES } from "#shared/constants";
import { logAdminAudit } from "#server/utils/audit";

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

  // 非字符串/非空值直接拒 400：validateCommentData 只用 .length 探测，数字/对象会绕过长度校验，
  // 仍写入 String 列被 Prisma 打挂成 500（name/mail/link/content 均需收窄）
  for (const v of [name, mail, link, content]) {
    if (v !== undefined && v !== null && typeof v !== "string") {
      throw createError({ statusCode: 400, message: "评论字段格式错误" });
    }
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

      // 状态变化用 updateMany + 乐观锁(where status = oldStatus)防并发竞态:
      // 两个并发 PATCH 都看到 status=0 → updateMany where status=0 只有 1 个赢(返 count=1),
      // 输的那个返 count=0 → 跳过计数 update(避免 comment_num +2)。
      // PG 默认 READ COMMITTED 下 updateMany 行锁直至 commit,保证原子。
      let statusActuallyChanged = false;
      if (normalizedStatus !== undefined && normalizedStatus !== oldComment.status) {
        const statusUpd = await tx.comments.updateMany({
          where: { coid, status: oldComment.status },
          data: { status: normalizedStatus },
        });
        statusActuallyChanged = statusUpd.count === 1;
      }

      const updated = await tx.comments.update({
        where: { coid },
        data: {
          ...(name !== undefined && { name }),
          ...(mail !== undefined && { mail }),
          ...(link !== undefined && { link }),
          ...(content !== undefined && { content }),
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

      // 状态真正变化时,更新文章评论计数(乐观锁保证只一个并发事务做计数)
      if (statusActuallyChanged) {
        if (normalizedStatus === 1) {
          await tx.contents.update({
            where: { cid: oldComment.cid },
            data: { comment_num: { increment: 1 } },
          });
        } else {
          await tx.contents.update({
            where: { cid: oldComment.cid },
            data: { comment_num: { decrement: 1 } },
          });
        }
      }

      return updated;
    });

    // 评论（含数）变更 → 立即失效首页/分类/标签/详情/归档 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: COMMENT_CACHE_ROUTES }).catch(err => console.error("[cache] 评论审核失效缓存失败", err));

    await logAdminAudit({

      actor: { uid: user.uid, name: user.name },

      action: "comment.approve",

      target: { type: "comment", id: coid },

    });

    return {
      success: true,
      data: comment,
    };
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    console.error(error);
    // 计数 update 时文章已被删 / 评论更新竞态被删 → P2025 → 404 而非 500
    if (isPrismaNotFoundError(error)) {
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
