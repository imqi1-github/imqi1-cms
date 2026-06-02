import { prisma } from "#server/utils/prisma";
import { notifyFriendLinkApplication } from "#server/utils/mail";
import { validateLinkData } from "#server/utils/validation";

// 检测页面是否包含指定链接
async function checkPageContainsLink(pageUrl: string, targetUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`检查友链页面失败: ${response.status}`);
      return false;
    }

    const html = await response.text();

    // 检查页面中是否包含本站链接（完全匹配数据库中的URL）
    const pageLower = html.toLowerCase();
    const containsLink = pageLower.includes(targetUrl.toLowerCase());

    return containsLink;
  } catch (error: any) {
    console.error('检查友链页面出错:', error.message);
    return false;
  }
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);

    // 验证参数
    if (!body.name || !body.link) {
      throw createError({
        statusCode: 400,
        message: "名称和链接为必填项",
      });
    }

    // 验证字段长度
    validateLinkData({
      name: body.name,
      link: body.link,
      desc: body.sort,
      avatar: body.avatar,
    });

    // 验证链接格式
    const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    if (!urlRegex.test(body.link)) {
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
      } catch {
        throw createError({
          statusCode: 400,
          message: "友链地址不是有效的URL",
        });
      }
    }

    // 获取后台设置
    const settings = await prisma.information.findMany({
      where: {
        key: { in: ['linkAutoApprove', 'siteUrl'] }
      }
    });

    const settingsMap: Record<string, string> = {};
    settings.forEach((s: any) => {
      settingsMap[s.key] = s.value;
    });

    const linkAutoApprove = settingsMap['linkAutoApprove'] === 'true';
    const siteUrl = settingsMap['siteUrl'] || 'https://imqi1.com';

    // 判断是否强制提交（跳过检测，直接进入待审核）
    const forceSubmit = body.forceSubmit === true;

    let autoApproved = false;
    let needCheckBacklink = false;

    // 如果开启了自动审核，且不是强制提交，且用户填写了友链地址
    if (linkAutoApprove && !forceSubmit && body.blogLinkUrl) {
      needCheckBacklink = true;
      console.log(`开始检测友链: ${body.blogLinkUrl} 是否包含 ${siteUrl}`);
      const hasBacklink = await checkPageContainsLink(body.blogLinkUrl, siteUrl);

      if (hasBacklink) {
        console.log('检测到友链，自动通过申请');
        autoApproved = true;
      } else {
        // 检测失败，返回错误信息
        return {
          code: 400,
          message: "链接检测失败，请检查是否正确添加本站友链",
          needRetry: true // 标识需要重试
        };
      }
    }

    // 创建友链
    const link = await prisma.link.create({
      data: {
        name: body.name.trim(),
        link: body.link.trim(),
        desc: body.sort?.trim() || null,
        avatar: body.avatar?.trim() || null,
        enabled: autoApproved // 如果检测到友链则自动启用
      }
    });

    // 友链申请通知 - 通知站长
    // 异步发送邮件，不阻塞响应
    notifyFriendLinkApplication(link.name, link.link, autoApproved);

    return {
      code: 200,
      message: autoApproved
        ? "系统已检测到贵站已添加本站友链，申请已自动通过"
        : "申请友链成功，等待管理员审核",
      data: link
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
      message: "申请友链失败",
    });
  }
});
