import DOMPurify from "isomorphic-dompurify";

import { getUser } from "#server/lib/auth";
import { auditText, getAuditConfig, mapAuditResultToStatus } from "#server/utils/baidu-audit";
import { verifyCaptcha } from "#server/utils/captcha";
import { getClientIp } from "#server/utils/client-ip";
import { validateCsrfToken } from "#server/utils/csrf";
import { notifyAdminNewComment, notifyAdminPendingComment, notifyCommentReply } from "#server/utils/mail";
import { prisma } from "#server/utils/prisma";
import { CommentCreateSchema, CommentItemSchema } from "#server/utils/schemas";
import { defineTypedApiHandler } from "#server/types/typedApi";
import { validateCommentData } from "#server/utils/validation";


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

export default defineTypedApiHandler(
  {
    body: CommentCreateSchema,
    response: CommentItemSchema,
    description: "提交评论",
  },
  async (event, { body }) => {
    try {
      const { csrfToken, cid, content, name, mail, link, parent_id } = body;

      // 验证 CSRF token
      if (!validateCsrfToken(event, csrfToken)) {
        throw createError({
          statusCode: 403,
          message: "CSRF token 验证失败，请刷新页面重试",
        });
      }

      // 反垃圾：蜜罐检测（前端隐藏字段，机器人会自动填充 website 字段）
      if (body.website) {
        // 静默丢弃，不返回错误信息（避免机器人根据响应调整策略）
        return { code: 200, message: "评论提交成功", data: null, needModeration: false };
      }

      // 反垃圾：图形验证码校验（登录用户免验证）
      const currentUser = await getUser(event);
      if (!currentUser && !verifyCaptcha(event, body.captcha ?? "")) {
        throw createError({
          statusCode: 400,
          message: "验证码错误或已过期",
        });
      }

      if (!cid || !content || !name) {
        throw createError({
          statusCode: 400,
          message: "缺少必填参数",
        });
      }

      // 目标文章必须存在且已发布，避免对任意 cid 灌评论、产生孤儿评论（type 不限，兼容留言板/页面）。
      const targetContent = await prisma.contents.findUnique({
        where: { cid },
        select: { cid: true, status: true },
      });
      if (!targetContent || targetContent.status !== 1) {
        throw createError({
          statusCode: 404,
          message: "文章不存在",
        });
      }

      // ========== 检查评论间隔 ==========
      // 客户端 IP：用共享 getClientIp（X-Real-IP → 最右 XFF → socket），与 mini/comments.post 保持一致，
      // 避免两端对同一请求推导出不同 IP 导致限流行为分叉。
      const clientIP = getClientIp(event);

      // 获取评论间隔设置
      const intervalMeta = await prisma.informations.findUnique({
        where: { key: "commentInterval" },
      });
      const intervalParsed = intervalMeta ? parseInt(intervalMeta.value, 10) : 60;
      const commentInterval = Number.isFinite(intervalParsed) ? intervalParsed : 60;

      if (clientIP && commentInterval > 0) {
        // 计算间隔时间点
        const intervalTime = new Date(Date.now() - commentInterval * 1000);

        // 查找该IP在间隔时间内是否有评论
        const recentComment = await prisma.comments.findFirst({
          where: {
            ip: clientIP,
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
          const url = new URL(link);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("Invalid link protocol");
          }
        } catch {
          throw createError({
            statusCode: 400,
            message: "链接格式不正确",
          });
        }
      }

      // 回复的评论必须存在且属于同一篇文章，避免产生悬挂的 parent_id / 跨文章回复通知。
      if (parent_id) {
        const parent = await prisma.comments.findFirst({
          where: { coid: parent_id, cid },
          select: { coid: true },
        });
        if (!parent) {
          throw createError({
            statusCode: 400,
            message: "回复的评论不存在",
          });
        }
      }

      // 获取User-Agent
      const userAgent = getHeader(event, "user-agent") || "unknown";

      // agent字段存储User-Agent，ip字段存储IP地址
      const agentValue = userAgent;

      const auditConfig = await getAuditConfig();
      let commentStatus = 1;
      let auditResult = null;

      if (auditConfig.enabled) {
        // 合并昵称和评论内容为一次审核请求，节省额度
        const auditText_content = `昵称：${name}，评论内容：${content}`;
        auditResult = await auditText(auditText_content);
        // 审核服务异常（conclusionType 0）降级为待审核，不自动发布（fail-open）。
        commentStatus = auditResult.conclusionType === 0
          ? 0
          : mapAuditResultToStatus(auditResult.conclusionType);
      } else {
        const meta = await prisma.informations.findUnique({
          where: { key: "commentModeration" },
        });
        const needModeration = meta?.value === "true";
        commentStatus = needModeration ? 0 : 1;
      }

      // 净化评论内容，防止 XSS 攻击
      const sanitizedContent = DOMPurify.sanitize(content, PURIFY_CONFIG) as string;

      const comment = await prisma.comments.create({
        data: {
          cid,
          content: sanitizedContent,
          name,
          mail: mail || null,
          link: link || null,
          parent_id: parent_id || null,
          status: commentStatus,
          agent: agentValue,
          ip: clientIP,
        },
      });

      // 更新文章的评论计数（仅统计已发布的评论）
      if (commentStatus === 1) {
        await prisma.contents.update({
          where: { cid },
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
        notifyAdminPendingComment(cid, name, content, commentStatus, comment.coid);
      }

      // 3. 评论回复通知 - 通知被回复的评论者
      // 如果是回复评论(parent_id不为null)
      if (parent_id) {
        // 获取父评论信息
        const parentComment = await prisma.comments.findUnique({
          where: { coid: parent_id },
          select: { name: true, mail: true, content: true },
        });

        // 如果父评论有邮箱，发送回复通知
        if (parentComment?.mail) {
          // 异步发送邮件
          notifyCommentReply(cid, parentComment.name, parentComment.mail, parentComment.content, name, content, comment.coid);
        }
      } else {
        // 2. 新评论通知 - 通知站长（仅顶级评论）
        // 如果是顶级评论且已发布(status === 1)，通知站长有新评论
        if (commentStatus === 1) {
          // 异步发送邮件
          notifyAdminNewComment(cid, name, content, comment.coid);
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
        data: { coid: comment.coid },
        needModeration: commentStatus === 0,
        auditResult: auditConfig.enabled ? auditResult : null,
      };
    } catch (error) {
      // 已构造的 HTTP 错误（400/403/404/429 等）原样抛出，保持原有 statusCode；
      // 绝不把 error.message 转发给客户端（会泄露内部细节）。
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      // Prisma 记录不存在（如读取目标时被并发删除）映射为 404
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        throw createError({
          statusCode: 404,
          message: "评论不存在",
        });
      }
      console.error(error);
      throw createError({
        statusCode: 500,
        message: "评论提交失败",
      });
    }
  },
);
