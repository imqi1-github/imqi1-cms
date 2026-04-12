import { prisma } from "#server/utils/prisma";
import { auditText, mapAuditResultToStatus, getAuditConfig } from "#server/utils/baidu-audit";
import {
  notifyAdminNewComment,
  notifyCommentReply,
  notifyAdminPendingComment,
} from "#server/utils/mail";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { cid, content, name, mail, link, parent_id } = body;

    if (!cid || !content || !name) {
      throw createError({
        statusCode: 400,
        message: "缺少必填参数",
      });
    }

    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      throw createError({
        statusCode: 400,
        message: "邮箱格式不正确",
      });
    }

    if (link) {
      try {
        new URL(link);
      } catch {
        throw createError({
          statusCode: 400,
          message: "链接格式不正确",
        });
      }
    }

    const userAgent = getHeader(event, "user-agent") || "unknown";

    const auditConfig = await getAuditConfig();
    let commentStatus = 1;
    let auditResult = null;

    if (auditConfig.enabled) {
      auditResult = await auditText(content);
      commentStatus = mapAuditResultToStatus(auditResult.conclusionType);
    } else {
      const meta = await prisma.informations.findUnique({
        where: { key: "commentModeration" },
      });
      const needModeration = meta?.value === "true";
      commentStatus = needModeration ? 0 : 1;
    }

    const comment = await prisma.comment.create({
      data: {
        cid: parseInt(cid),
        content,
        name,
        mail: mail || null,
        link: link || null,
        parent_id: parent_id || null,
        status: commentStatus,
        agent: userAgent,
      },
    });

    // ========== 邮件通知逻辑 ==========

    // 4. 待审核/垃圾评论通知 - 通知站长
    // 如果评论状态不是已发布(status !== 1)，则通知站长
    if (commentStatus !== 1) {
      // 异步发送邮件，不阻塞响应
      notifyAdminPendingComment(parseInt(cid), name, content, commentStatus);
    }

    // 3. 评论回复通知 - 通知被回复的评论者
    // 如果是回复评论(parent_id不为null)
    if (parent_id) {
      // 获取父评论信息
      const parentComment = await prisma.comment.findUnique({
        where: { coid: parseInt(parent_id as string) },
        select: { name: true, mail: true, content: true },
      });

      // 如果父评论有邮箱，发送回复通知
      if (parentComment?.mail) {
        // 异步发送邮件
        notifyCommentReply(
          parseInt(cid),
          parentComment.name,
          parentComment.mail,
          parentComment.content,
          name,
          content
        );
      }
    } else {
      // 2. 新评论通知 - 通知站长（仅顶级评论）
      // 如果是顶级评论且已发布(status === 1)，通知站长有新评论
      if (commentStatus === 1) {
        // 异步发送邮件
        notifyAdminNewComment(parseInt(cid), name, content);
      }
    }

    let message = "评论提交成功";
    if (auditConfig.enabled && auditResult) {
      if (auditResult.conclusionType === 2) {
        message = "评论内容违规，已被标记为垃圾";
      } else if (auditResult.conclusionType === 3) {
        message = "评论内容疑似违规，请等待审核";
      } else if (auditResult.conclusionType === 4) {
        message = "评论提交成功，请等待审核";
      }
    } else if (commentStatus === 0) {
      message = "评论提交成功，请等待审核";
    }

    return {
      code: 200,
      message,
      data: comment,
      needModeration: commentStatus === 0,
      auditResult: auditConfig.enabled ? auditResult : null,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      });
    }
    throw createError({
      statusCode: 500,
      message: "评论提交失败",
    });
  }
});
