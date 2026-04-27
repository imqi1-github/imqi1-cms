import { auditText, getAuditConfig, mapAuditResultToStatus } from "#server/utils/baidu-audit";
import { validateCsrfToken } from "#server/utils/csrf";
import { notifyAdminNewComment, notifyAdminPendingComment, notifyCommentReply } from "#server/utils/mail";
import { prisma } from "#server/utils/prisma";
import { validateCommentData } from "#server/utils/validation";
import DOMPurify from "isomorphic-dompurify";

// HTML 净化配置 - 只允许安全的标签和属性
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "a", "img", "code", "pre"],
  ALLOWED_ATTR: ["href", "src", "alt", "class", "title"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOW_SELF_CLOSE_IN_ATTR: false,
  SAFE_FOR_TEMPLATES: true,
  WHOLE_DOCUMENT: false,
  CUSTOM_ELEMENT_HANDLING: {
    tagNameCheck: null,
    attributeNameCheck: null,
    allowCustomizedBuiltInElements: false,
  },
};

export default defineEventHandler(async event => {
  try {
    // CSRF 验证
    const body = await readBody(event);
    const { csrfToken, cid, content, name, mail, link, parent_id } = body;

    // 验证 CSRF token
    if (!validateCsrfToken(event, csrfToken)) {
      throw createError({
        statusCode: 403,
        message: "CSRF token 验证失败，请刷新页面重试",
      });
    }

    if (!cid || !content || !name) {
      throw createError({
        statusCode: 400,
        message: "缺少必填参数",
      });
    }

    // ========== 检查评论间隔 ==========
    // 获取客户端IP
    const clientIP = getHeader(event, "x-forwarded-for")?.split(",")[0].trim() ||
                     getHeader(event, "x-real-ip") ||
                     event.node.req.socket.remoteAddress ||
                     "unknown";

    // 获取评论间隔设置
    const intervalMeta = await prisma.information.findUnique({
      where: { key: "commentInterval" },
    });
    const commentInterval = intervalMeta ? parseInt(intervalMeta.value) : 60;

    if (commentInterval > 0) {
      // 计算间隔时间点
      const intervalTime = new Date(Date.now() - commentInterval * 1000);

      // 查找该IP在间隔时间内是否有评论
      // agent字段格式: IP||User-Agent
      const recentComment = await prisma.comment.findFirst({
        where: {
          agent: { startsWith: `${clientIP}||` },
          create_time: { gte: intervalTime },
        },
        orderBy: { create_time: "desc" },
      });

      if (recentComment) {
        // 计算剩余秒数
        const lastCommentTime = new Date(recentComment.create_time).getTime();
        const elapsed = Date.now() - lastCommentTime;
        const remaining = Math.ceil((commentInterval * 1000 - elapsed) / 1000);

        return {
          code: 429,
          message: `评论太频繁，请 ${remaining} 秒后再试`,
        };
      }
    }

    // 验证字段长度
    validateCommentData({ name, mail, link });

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

    // 获取User-Agent
    const userAgent = getHeader(event, "user-agent") || "unknown";

    // 将IP地址存储到agent字段，用于评论间隔检查
    // clientIP 变量已在前面声明
    const agentValue = `${clientIP}||${userAgent}`;

    const auditConfig = await getAuditConfig();
    let commentStatus = 1;
    let auditResult = null;

    if (auditConfig.enabled) {
      auditResult = await auditText(content);
      commentStatus = mapAuditResultToStatus(auditResult.conclusionType);
    } else {
      const meta = await prisma.information.findUnique({
        where: { key: "commentModeration" },
      });
      const needModeration = meta?.value === "true";
      commentStatus = needModeration ? 0 : 1;
    }

    // 净化评论内容，防止 XSS 攻击
    const sanitizedContent = DOMPurify.sanitize(content, PURIFY_CONFIG);

    const comment = await prisma.comment.create({
      data: {
        cid: parseInt(cid),
        content: sanitizedContent,
        name,
        mail: mail || null,
        link: link || null,
        parent_id: parent_id || null,
        status: commentStatus,
        agent: agentValue,
      },
    });

    // 更新文章的评论计数（仅统计已发布的评论）
    if (commentStatus === 1) {
      await prisma.post.update({
        where: { cid: parseInt(cid) },
        data: {
          comment_num: {
            increment: 1,
          },
        },
      });
    }

    // ========== 邮件通知逻辑 ==========

    // 4. 待审核/垃圾评论通知 - 通知站长
    // 如果评论状态不是已发布(status !== 1)，则通知站长
    if (commentStatus !== 1) {
      // 异步发送邮件，不阻塞响应
      notifyAdminPendingComment(parseInt(cid), name, content, commentStatus, comment.coid);
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
        notifyCommentReply(parseInt(cid), parentComment.name, parentComment.mail, parentComment.content, name, content, comment.coid);
      }
    } else {
      // 2. 新评论通知 - 通知站长（仅顶级评论）
      // 如果是顶级评论且已发布(status === 1)，通知站长有新评论
      if (commentStatus === 1) {
        // 异步发送邮件
        notifyAdminNewComment(parseInt(cid), name, content, comment.coid);
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
  } catch (error: any) {
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
