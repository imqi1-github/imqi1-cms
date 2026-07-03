import DOMPurify from "isomorphic-dompurify";

import { siteConfig } from "~~/site.config";
import type { MiniCommentCreateResponse } from "#server/types/apis/mini";
import { auditText, getAuditConfig, mapAuditResultToStatus } from "#server/utils/baidu-audit";
import { notifyAdminNewComment, notifyAdminPendingComment, notifyCommentReply } from "#server/utils/mail";
import { prisma } from "#server/utils/prisma";
import { validateCommentData } from "#server/utils/validation";

// HTML 净化配置：与主站 comments.post.ts 保持一致，只允许安全标签/属性。
// 小程序端本就以纯文本展示评论，此处净化是入库前的双重兜底（防其他端复用同一数据时 XSS）。
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

interface MiniCommentBody {
  cid?: number;
  content?: string;
  name?: string;
  mail?: string | null;
  link?: string | null;
  parent_id?: number | null;
  /** 蜜罐字段：人类不会填写，机器人会自动填充 */
  website?: string;
}

export default defineEventHandler(async event => {
  // 评论功能总开关：关闭时直接拒收（与 comments.get 的空列表行为对应）。
  if (!siteConfig.features.miniComment) {
    throw createError({ statusCode: 403, message: "评论功能已关闭" });
  }

  try {
    const body = await readBody<MiniCommentBody>(event);
    const { cid, content, name } = body;
    const mail = body.mail || null;
    const link = body.link || null;
    const parentId = body.parent_id || null;

    // 反垃圾：蜜罐。命中则静默"成功"，不暴露拦截逻辑给机器人。
    if (body.website) {
      return {
        success: true,
        data: { needModeration: false },
        message: "评论提交成功",
      } satisfies MiniCommentCreateResponse;
    }

    if (!cid || !Number.isInteger(cid) || cid <= 0 || !content || !name) {
      throw createError({ statusCode: 400, message: "缺少必填参数" });
    }

    if (content.length > 5000) {
      throw createError({ statusCode: 400, message: "评论内容过长" });
    }

    // 目标文章必须存在且已发布，避免对任意 cid 灌评论。
    const post = await prisma.posts.findFirst({
      where: { cid, type: 0, status: 1 },
      select: { cid: true },
    });
    if (!post) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }

    // ========== IP 间隔防刷（小程序无 CSRF/图形验证码，这是主力防线）==========
    const clientIP = getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ||
      getHeader(event, "x-real-ip") ||
      event.node.req.socket.remoteAddress ||
      "unknown";

    const intervalMeta = await prisma.informations.findUnique({
      where: { key: "commentInterval" },
    });
    const commentInterval = intervalMeta ? parseInt(intervalMeta.value) : 60;

    if (commentInterval > 0) {
      const intervalTime = new Date(Date.now() - commentInterval * 1000);
      const recentComment = await prisma.comments.findFirst({
        where: { ip: clientIP, create_time: { gte: intervalTime } },
        orderBy: { create_time: "desc" },
      });

      if (recentComment) {
        const elapsed = Date.now() - new Date(recentComment.create_time).getTime();
        const remaining = Math.ceil((commentInterval * 1000 - elapsed) / 1000);
        throw createError({
          statusCode: 429,
          message: `评论太频繁，请 ${remaining} 秒后再试`,
        });
      }
    }

    // 字段长度与格式校验
    validateCommentData({ name, mail, link });

    // 邮箱/链接必填跟随主站设置（commentRequireMail 默认 true、commentRequireLink 默认 false）。
    const [mailMeta, linkMeta] = await Promise.all([
      prisma.informations.findUnique({ where: { key: "commentRequireMail" } }),
      prisma.informations.findUnique({ where: { key: "commentRequireLink" } }),
    ]);
    const requireMail = mailMeta ? mailMeta.value === "true" : true;
    const requireLink = linkMeta ? linkMeta.value === "true" : false;

    if (requireMail && !mail) {
      throw createError({ statusCode: 400, message: "请填写邮箱" });
    }
    if (requireLink && !link) {
      throw createError({ statusCode: 400, message: "请填写链接" });
    }

    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      throw createError({ statusCode: 400, message: "邮箱格式不正确" });
    }

    if (link) {
      try {
        const url = new URL(link);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Invalid link protocol");
        }
      } catch {
        throw createError({ statusCode: 400, message: "链接格式不正确" });
      }
    }

    // 若回复评论，父评论必须存在且属于同一篇文章。
    if (parentId) {
      const parent = await prisma.comments.findFirst({
        where: { coid: parentId, cid },
        select: { coid: true },
      });
      if (!parent) {
        throw createError({ statusCode: 400, message: "回复的评论不存在" });
      }
    }

    // 客户端标识：带 X-Client-Platform: mini 的请求视为小程序评论，
    // agent 统一记为 "Mini"（主站评论区据此展示小程序图标）；其余请求沿用原始 UA。
    const userAgent = getHeader(event, "x-client-platform") === "mini"
      ? "Mini"
      : getHeader(event, "user-agent") || "unknown";

    // ========== 审核策略：完全跟随主站设置（百度审核 or 人工审核开关）==========
    const auditConfig = await getAuditConfig();
    let commentStatus = 1;
    let auditResult = null;

    if (auditConfig.enabled) {
      auditResult = await auditText(`昵称：${name}，评论内容：${content}`);
      commentStatus = mapAuditResultToStatus(auditResult.conclusionType);
    } else {
      const meta = await prisma.informations.findUnique({
        where: { key: "commentModeration" },
      });
      commentStatus = meta?.value === "true" ? 0 : 1;
    }

    const sanitizedContent = DOMPurify.sanitize(content, PURIFY_CONFIG) as string;

    const comment = await prisma.comments.create({
      data: {
        cid,
        content: sanitizedContent,
        name,
        mail,
        link,
        parent_id: parentId,
        status: commentStatus,
        agent: userAgent,
        ip: clientIP,
      },
    });

    // 仅已发布评论计入文章评论数
    if (commentStatus === 1) {
      await prisma.posts.update({
        where: { cid },
        data: { comment_num: { increment: 1 } },
      });
    }

    // ========== 邮件通知（异步，不阻塞响应）==========
    if (commentStatus !== 1) {
      notifyAdminPendingComment(cid, name, content, commentStatus, comment.coid);
    }

    if (parentId) {
      const parentComment = await prisma.comments.findUnique({
        where: { coid: parentId },
        select: { name: true, mail: true, content: true },
      });
      if (parentComment?.mail) {
        notifyCommentReply(cid, parentComment.name, parentComment.mail, parentComment.content, name, content, comment.coid);
      }
    } else if (commentStatus === 1) {
      notifyAdminNewComment(cid, name, content, comment.coid);
    }

    const message = commentStatus === 0
      ? "评论提交成功，请等待审核"
      : commentStatus === 2
        ? "评论内容违规，已被标记"
        : "评论提交成功";

    return {
      success: true,
      data: { needModeration: commentStatus !== 1 },
      message,
    } satisfies MiniCommentCreateResponse;
  } catch (error) {
    // 已构造的 HTTP 错误（400/404/429 等）原样抛出，交给端上提示。
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error(error);
    throw createError({ statusCode: 500, message: "评论提交失败" });
  }
});
