import { prisma } from "#server/utils/prisma";
import { validateLinkData } from "#server/utils/validation";
import { notifyFriendLinkModification } from "#server/utils/mail";
import { ensureUrlProtocol } from "#server/utils/urlGuard";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);

    // 请求体必须是对象：readBody 可能返回 null/数组/字符串，后续解构或字段访问会抛 TypeError
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw createError({
        statusCode: 400,
        message: "请求体格式错误",
      });
    }

    const { name, link, desc, avatar, originalLinkId, csrfToken } = body as Record<string, unknown>;

    // CSRF 双提交校验（游客写接口同样需要，防跨站伪造提交）
    if (!validateCsrfToken(event, typeof csrfToken === "string" ? csrfToken : "")) {
      throw createError({
        statusCode: 403,
        message: "CSRF token 验证失败，请刷新页面重试",
      });
    }

    // 验证必填字段：name/link 必须是字符串，否则后续 .trim()/URL 解析会抛 TypeError
    if (typeof name !== "string" || !name.trim() || typeof link !== "string" || !link.trim()) {
      throw createError({
        statusCode: 400,
        message: "名称和链接为必填项",
      });
    }

    // desc/avatar 可选：若提供必须为字符串（允许 null/缺省），否则后续 .trim() 会抛 TypeError
    if (desc !== undefined && desc !== null && typeof desc !== "string") {
      throw createError({
        statusCode: 400,
        message: "描述格式不正确",
      });
    }
    if (avatar !== undefined && avatar !== null && typeof avatar !== "string") {
      throw createError({
        statusCode: 400,
        message: "头像格式不正确",
      });
    }

    // 验证原友链ID | 必须是正整数，否则 Prisma where id 传非整数会抛校验错误 → 500
    const originalId = Number(originalLinkId);
    if (!Number.isInteger(originalId) || originalId <= 0) {
      throw createError({
        statusCode: 400,
        message: "缺少原友链ID",
      });
    }

    // 验证字段长度
    validateLinkData({
      name,
      link,
      desc,
      avatar,
    });

    // 严格校验链接协议：仅允许 http/https，杜绝 javascript:/data: 等存储型 XSS
    try {
      const parsed = new URL(ensureUrlProtocol(link));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw createError({
        statusCode: 400,
        message: "链接格式不正确",
      });
    }

    // 查找原友链（existence 前置校验，避免先建后又因后续 400 产生孤儿行）
    const originalLink = await prisma.links.findUnique({
      where: { id: originalId },
    });

    if (!originalLink) {
      throw createError({
        statusCode: 404,
        message: "原友链不存在",
      });
    }

    // 创建修改请求（默认禁用，等待审核）
    const modificationLink = await prisma.links.create({
      data: {
        name: name.trim(),
        // 补全协议，避免无 http(s):// 前缀的链接在前台被当相对路径 → 死链
        link: ensureUrlProtocol(link),
        desc: desc?.trim() || null,
        avatar: avatar?.trim() || null,
        enabled: false,  // 默认禁用，等待审核
        isModification: true,
        originalLinkId: originalId,
        modificationStatus: "pending",
      },
    });

    // 发送邮件通知站长（异步，不阻塞响应）
    notifyFriendLinkModification(
      { name: originalLink.name, link: originalLink.link },
      { name: modificationLink.name, link: modificationLink.link, desc: modificationLink.desc, avatar: modificationLink.avatar }
    );

    return {
      code: 200,
      message: "友链修改请求已提交，等待管理员审核",
      // 不回传整行：enabled/isModification/modificationStatus/originalLinkId 等为内部审核字段
    };
  } catch (error) {
    // createError 抛出的业务错误（400 参数校验 / 403 CSRF / 404 未找到）带 statusCode，原样抛出，
    // 避免被统一改写为 500 或把内部 error.message 泄露给游客
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "提交修改请求失败",
    });
  }
});
