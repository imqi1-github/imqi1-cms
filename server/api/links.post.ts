import { prisma } from "#server/utils/prisma";
import { notifyFriendLinkApplication } from "#server/utils/mail";
import { validateLinkData } from "#server/utils/validation";
import { ensureUrlProtocol } from "#server/utils/urlGuard";
import { fetchPublicUrl } from "#server/utils/safe-fetch";
import { validateCsrfToken } from "#server/utils/csrf";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { siteConfig } from "~~/site.config";

// 检测页面是否包含指定链接
async function checkPageContainsLink(pageUrl: string, targetUrl: string): Promise<boolean> {
  try {
    // 安全外联：校验公网 + 钉定已校验 IP（封 DNS rebinding），统一 redirect:"error" 与 10s 超时
    const html = await fetchPublicUrl(
      pageUrl,
      async response => {
        if (!response.ok) {
          console.error(`检查友链页面失败: ${response.status}`);
          return "";
        }
        return response.text();
      },
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      },
      10000,
    );

    // 检查页面中是否包含本站链接（完全匹配数据库中的URL）
    const pageLower = html.toLowerCase();
    return pageLower.includes(targetUrl.toLowerCase());
  } catch (error) {
    console.error(error);
    return false;
  }
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);

    // 写接口入参必须是普通对象，拒绝 null/数组/标量，避免后续 body.name/.trim() 抛 TypeError → 500
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw createError({ statusCode: 400, message: "请求参数格式错误" });
    }

    // CSRF 双提交校验（游客写接口同样需要，防跨站伪造提交）
    const { csrfToken } = body as { csrfToken?: string };
    if (!validateCsrfToken(event, csrfToken ?? "")) {
      throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
    }

    // 验证参数：名称/链接必填且必须为字符串（非字符串会在下方 .trim() 抛 TypeError → 500）
    if (typeof body.name !== "string" || typeof body.link !== "string" || !body.name.trim() || !body.link.trim()) {
      throw createError({
        statusCode: 400,
        message: "名称和链接为必填项",
      });
    }

    // 可选字段若提供必须为字符串（数字/对象会使 .trim()/new URL 崩溃，须以 400 拒绝而非 500）
    if (body.desc != null && typeof body.desc !== "string") {
      throw createError({ statusCode: 400, message: "描述格式不正确" });
    }
    if (body.avatar != null && typeof body.avatar !== "string") {
      throw createError({ statusCode: 400, message: "头像格式不正确" });
    }
    if (body.blogLinkUrl != null && typeof body.blogLinkUrl !== "string") {
      throw createError({ statusCode: 400, message: "友链地址格式不正确" });
    }

    // 验证字段长度
    validateLinkData({
      name: body.name,
      link: body.link,
      desc: body.desc,
      avatar: body.avatar,
    });

    // 严格校验链接协议：仅允许 http/https，杜绝 javascript:/data: 等存储型 XSS
    try {
      const parsed = new URL(ensureUrlProtocol(body.link));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw createError({
        statusCode: 400,
        message: "链接格式不正确",
      });
    }

    // 验证友链地址格式（如果填写了）
    if (body.blogLinkUrl) {
      // 更严格的URL格式验证，要求必须以 http:// 或 https:// 开头
      const blogLinkUrlRegex = /^https?:\/\/.+/i;
      if (!blogLinkUrlRegex.test(body.blogLinkUrl)) {
        throw createError({
          statusCode: 400,
          message: "友链地址格式不正确，必须以 http:// 或 https:// 开头",
        });
      }

      // 验证友链地址是否为有效URL
      try {
        new URL(body.blogLinkUrl);
      } catch (error) {
        console.error(error);
        throw createError({
          statusCode: 400,
          message: "友链地址不是有效的URL",
        });
      }
    }

    // 获取后台设置
    const settings = await prisma.informations.findMany({
      where: {
        key: { in: ["linkAutoApprove", "siteUrl"] },
      },
      // 硬性约定 1：公开读 findMany 显式 select，仅取消费者用到的列
      select: {
        key: true,
        value: true,
      },
    });

    const settingsMap: Record<string, string> = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const linkAutoApprove = settingsMap["linkAutoApprove"] === "true";
    const siteUrl = settingsMap["siteUrl"] || siteConfig.siteUrl;

    // 判断是否强制提交（跳过检测，直接进入待审核）
    const forceSubmit = body.forceSubmit === true;

    let autoApproved = false;

    // 如果开启了自动审核，且不是强制提交，且用户填写了友链地址
    if (linkAutoApprove && !forceSubmit && body.blogLinkUrl) {
      const hasBacklink = await checkPageContainsLink(body.blogLinkUrl, siteUrl);

      if (hasBacklink) {
        autoApproved = true;
      } else {
        // 检测失败，返回错误信息
        return {
          code: 400,
          message: "链接检测失败，请检查是否正确添加本站友链",
          needRetry: true, // 标识需要重试
        };
      }
    }

    // 创建友链
    const link = await prisma.links.create({
      data: {
        name: body.name.trim(),
        // 补全协议，避免无 http(s):// 前缀的链接在前台被当相对路径 → 死链
        link: ensureUrlProtocol(body.link),
        desc: body.desc?.trim() || null,
        avatar: body.avatar?.trim() || null,
        enabled: autoApproved, // 如果检测到友链则自动启用
      },
    });

    // 免审核申请：检测到友链时 enabled=true（立即可见）→ 立即失效友链页 / 博客网络地图页 ISR 缓存（best-effort）
    if (autoApproved) {
      void invalidateContentCaches({ routes: ["/links", "/map"] }).catch(err => console.error("[cache] 友链申请失效缓存失败", err));
    }

    // 友链申请通知 - 通知站长
    // 异步发送邮件，不阻塞响应
    notifyFriendLinkApplication(link.name, link.link, autoApproved);

    return {
      code: 200,
      message: autoApproved ? "系统已检测到贵站已添加本站友链，申请已自动通过" : "申请友链成功，等待管理员审核",
      // 不回传整行：enabled/isModification/modificationStatus/originalLinkId 等为内部审核字段
    };
  } catch (error) {
    // createError 抛出的业务错误（400 参数校验 / 403 CSRF 等）带 statusCode，原样抛出，
    // 避免被统一改写为 500 或把内部 error.message 泄露给游客
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "申请友链失败",
    });
  }
});
