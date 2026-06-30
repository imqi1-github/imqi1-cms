import * as fs from "fs";
import * as path from "path";

import prisma from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";
import type { MailOptions } from "#server/types/utils/mail";

// 邮件日志目录
const LOG_DIR = path.join(process.cwd(), "logs", "mail");

// 确保日志目录存在
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// 获取日志文件路径
function getLogFilePath() {
  const date = new Date().toISOString().split("T")[0];
  return path.join(LOG_DIR, `${date}.log`);
}

// 写入日志
function writeLog(level: string, message: string, data?: Record<string, unknown>) {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };
  const logLine = JSON.stringify(logEntry) + "\n";
  fs.appendFileSync(getLogFilePath(), logLine, "utf-8");
}

// 获取邮件配置
async function getMailConfig() {
  const settings = await prisma.informations.findMany({
    where: {
      key: {
        in: [
          "emailLogEnabled",
          "emailPushType",
          "smtpHost",
          "smtpPort",
          "smtpSecureMode",
          "smtpUser",
          "smtpPassword",
          "smtpFromName",
          "smtpAddress",
          "adminEmail",
          "notifyAdmin",
        ],
      },
    },
  });

  const get = (key: string) => settings.find(s => s.key === key)?.value || "";

  return {
    logEnabled: get("emailLogEnabled") === "true",
    pushType: get("emailPushType") || "none",
    host: get("smtpHost"),
    port: parseInt(get("smtpPort")) || 465,
    secureMode: get("smtpSecureMode") || "tls",
    user: get("smtpUser"),
    password: get("smtpPassword"),
    fromName: get("smtpFromName") || "Blog",
    address: get("smtpAddress") || get("smtpUser"),
    adminEmail: get("adminEmail"),
    notifyAdmin: get("notifyAdmin") === "true",
  };
}

// 创建邮件传输器
async function createTransporter() {
  const config = await getMailConfig();

  if (config.pushType === "none" || !config.host) {
    return null;
  }

  // nodemailer 仅在实际发送邮件时才动态加载，避免冷启动时拉入 ~540KB
  const { default: nodemailer } = await import("nodemailer");
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secureMode === "ssl",
    auth: {
      user: config.user,
      pass: config.password,
    },
  });
}

// 发送邮件
export async function sendMail(options: MailOptions): Promise<boolean> {
  const config = await getMailConfig();

  // 记录日志
  if (config.logEnabled) {
    writeLog("info", "准备发送邮件", {
      to: options.to,
      subject: options.subject,
    });
  }

  // 如果推送类型是 none，只记录日志
  if (config.pushType === "none") {
    if (config.logEnabled) {
      writeLog("warn", "邮件推送未启用，跳过发送", {
        to: options.to,
        subject: options.subject,
      });
    }
    return true;
  }

  try {
    const transporter = await createTransporter();

    if (!transporter) {
      throw new Error("无法创建邮件传输器，请检查 SMTP 配置");
    }

    const from = config.address ? `"${config.fromName}" <${config.address}>` : config.user;

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    if (config.logEnabled) {
      writeLog("info", "邮件发送成功", {
        to: options.to,
        subject: options.subject,
      });
    }

    return true;
  } catch (error) {
    console.error(error);
    if (config.logEnabled) {
      writeLog("error", "邮件发送失败", {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  }
}

// 发送测试邮件
export async function sendTestEmail(to: string): Promise<{ success: boolean; message: string }> {
  const config = await getMailConfig();

  if (config.pushType === "none") {
    return { success: false, message: "邮件推送未启用" };
  }

  if (!config.host) {
    return { success: false, message: "SMTP 配置不完整" };
  }

  try {
    const transporter = await createTransporter();

    if (!transporter) {
      return { success: false, message: "无法创建邮件传输器" };
    }

    const from = config.address ? `"${config.fromName}" <${config.address}>` : config.user;

    await transporter.sendMail({
      from,
      to,
      subject: "测试邮件",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">测试邮件</h2>
          <p>这是一封测试邮件，如果您收到此邮件，说明您的 SMTP 配置正确！</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            发送时间: ${new Date().toLocaleString("zh-CN")}
          </p>
        </div>
      `,
    });

    writeLog("info", "测试邮件发送成功", { to });
    return { success: true, message: "测试邮件发送成功" };
  } catch (error) {
    console.error(error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    writeLog("error", "测试邮件发送失败", { to, error: errorMsg });
    return { success: false, message: `发送失败: ${errorMsg}` };
  }
}

// 获取站点信息
async function getSiteInfo() {
  const settings = await prisma.informations.findMany({
    where: {
      key: {
        in: ["siteName", "siteUrl"],
      },
    },
  });

  const get = (key: string) => settings.find(s => s.key === key)?.value || "";

  return {
    name: get("siteName") || siteConfig.siteName,
    url: get("siteUrl") || siteConfig.siteUrl,
  };
}

// 生成邮件基础模板
function createEmailTemplate(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 4px; overflow: hidden; }
    .header { background: #fff; padding: 24px 20px; border-bottom: 1px solid #e5e7eb; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 500; color: #111; }
    .content { padding: 24px 20px; }
    .content p { margin: 0 0 12px; }
    .info-box { background: #f9fafb; border-left: 2px solid #d1d5db; padding: 12px 16px; margin: 16px 0; }
    .info-box p { margin: 0; }
    .info-meta { font-size: 12px; color: #666; margin-top: 8px; }
    .link { color: #111; text-decoration: underline; }
    .footer { padding: 16px 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      此邮件由系统自动发送，请勿直接回复
    </div>
  </div>
</body>
</html>
  `;
}

// 获取文章的完整 URL
async function getPostUrl(cid: number, commentId?: number): Promise<string> {
  const siteInfo = await getSiteInfo();
  const post = await prisma.posts.findUnique({
    where: { cid },
    select: { slug: true },
  });

  let url: string;
  if (post?.slug) {
    // 优先使用 slug
    const category = await prisma.postrelations.findFirst({
      where: { cid },
      select: {
        metas: {
          select: {
            slug: true,
          },
        },
      },
    });
    const categorySlug = category?.metas?.slug || "posts";
    url = `${siteInfo.url}/content/${categorySlug}/${post.slug}`;
  } else {
    url = `${siteInfo.url}/content/posts/${cid}`;
  }

  // 如果提供了评论ID，添加评论锚点
  if (commentId) {
    url += `#comment-${commentId}`;
  }

  return url;
}

// 获取文章标题
async function getPostTitle(cid: number): Promise<string> {
  const post = await prisma.posts.findUnique({
    where: { cid },
    select: { title: true },
  });
  return post?.title || "未知文章";
}

// ========== 4类邮件通知功能 ==========

// 1. 友链申请通知 - 通知站长
export async function notifyFriendLinkApplication(linkName: string, linkUrl: string, autoApproved = false): Promise<boolean> {
  const config = await getMailConfig();

  // 检查是否启用邮件通知
  if (config.pushType === "none" || !config.adminEmail) {
    writeLog("warn", "邮件推送未启用，跳过友链申请通知", { linkName, linkUrl, autoApproved });
    return false;
  }

  const siteInfo = await getSiteInfo();
  const subject = `[${siteInfo.name}] ${autoApproved ? "友链已自动添加" : "新的友链申请"}`;

  const content = `
    <h2>${autoApproved ? "友链已自动添加" : "友链申请通知"}</h2>
    ${
      autoApproved
        ? `<p>系统检测到 <strong>${siteInfo.name}</strong> 的友链已在对方网站添加，已自动通过：</p>`
        : `<p>有人在 <strong>${siteInfo.name}</strong> 申请了友链：</p>`
    }
    <div class="info-box">
      <p><strong>网站名称：</strong>${linkName}</p>
      <p><strong>网站链接：</strong><a href="${linkUrl}" target="_blank">${linkUrl}</a></p>
    </div>
    ${autoApproved ? `<p>此友链已自动启用，您可以前往后台进行管理。</p>` : `<p>请前往后台审核此友链申请。</p>`}
    <p><a href="${siteInfo.url}/admin/links" class="link">前往后台管理</a></p>
  `;

  return await sendMail({
    to: config.adminEmail,
    subject,
    html: createEmailTemplate(autoApproved ? "友链已自动添加" : "友链申请通知", content),
  });
}

// 2. 新评论通知 - 通知站长（顶级评论）
export async function notifyAdminNewComment(postId: number, commenterName: string, commentContent: string, commentId: number): Promise<boolean> {
  const config = await getMailConfig();

  // 检查是否启用邮件通知
  if (config.pushType === "none" || !config.adminEmail) {
    writeLog("warn", "邮件推送未启用，跳过新评论通知", { postId, commenterName });
    return false;
  }

  const siteInfo = await getSiteInfo();
  const postTitle = await getPostTitle(postId);
  const postUrl = await getPostUrl(postId, commentId);
  const subject = `[${siteInfo.name}] 文章新评论：${commenterName}`;

  const content = `
    <h2>文章新评论通知</h2>
    <p>您的文章 <strong>${postTitle}</strong> 收到了一条新评论：</p>
    <div class="info-box">
      <p><strong>${commenterName}</strong> 评论道：</p>
      <p>${commentContent}</p>
    </div>
    <p><a href="${postUrl}" class="link">查看评论</a></p>
  `;

  return await sendMail({
    to: config.adminEmail,
    subject,
    html: createEmailTemplate("文章新评论通知", content),
  });
}

// 3. 评论回复通知 - 通知被回复的评论者
export async function notifyCommentReply(
  postId: number,
  parentCommenterName: string,
  parentCommenterEmail: string,
  parentCommentContent: string,
  replierName: string,
  replyContent: string,
  commentId: number,
): Promise<boolean> {
  const config = await getMailConfig();

  // 检查是否启用邮件通知
  if (config.pushType === "none") {
    writeLog("warn", "邮件推送未启用，跳过评论回复通知", {
      postId,
      parentCommenterName,
      replierName,
    });
    return false;
  }

  // 如果被回复者就是自己（同一个邮箱），不发送通知
  if (parentCommenterEmail === config.address) {
    writeLog("info", "被回复者为自己，跳过回复通知", {
      postId,
      parentCommenterName,
      replierName,
    });
    return false;
  }

  const siteInfo = await getSiteInfo();
  const postTitle = await getPostTitle(postId);
  const postUrl = await getPostUrl(postId, commentId);
  const subject = `[${siteInfo.name}] 您的评论收到了回复`;

  const content = `
    <h2>评论回复通知</h2>
    <p>您好 <strong>${parentCommenterName}</strong>，</p>
    <p>您在文章 <strong>${postTitle}</strong> 下的评论收到了 <strong>${replierName}</strong> 的回复：</p>
    <div class="info-box">
      <p><strong>您的原评论：</strong></p>
      <p>${parentCommentContent}</p>
    </div>
    <div class="info-box">
      <p><strong>${replierName}</strong> 回复道：</p>
      <p>${replyContent}</p>
    </div>
    <p><a href="${postUrl}" class="link">查看回复</a></p>
  `;

  return await sendMail({
    to: parentCommenterEmail,
    subject,
    html: createEmailTemplate("评论回复通知", content),
  });
}

// 4. 待审核/垃圾评论通知 - 通知站长
export async function notifyAdminPendingComment(
  postId: number,
  commenterName: string,
  commentContent: string,
  status: number,
  commentId: number,
): Promise<boolean> {
  const config = await getMailConfig();

  // 检查是否启用邮件通知
  if (config.pushType === "none" || !config.adminEmail) {
    writeLog("warn", "邮件推送未启用，跳过待审核评论通知", { postId, commenterName, status });
    return false;
  }

  const siteInfo = await getSiteInfo();
  const postTitle = await getPostTitle(postId);
  const postUrl = await getPostUrl(postId, commentId);

  // status: 0-待审核, 1-已发布, 2-垃圾
  const isSpam = status === 2;
  const typeLabel = isSpam ? "垃圾评论" : "待审核评论";
  const subject = `[${siteInfo.name}] 新的${typeLabel}：${commenterName}`;

  const content = `
    <h2>${typeLabel}通知</h2>
    <p>文章 <strong>${postTitle}</strong> 收到了一条${typeLabel}：</p>
    <div class="info-box">
      <p><strong>${commenterName}</strong> 评论道：</p>
      <p>${commentContent}</p>
      <p class="info-meta">状态：${isSpam ? "垃圾评论" : "等待审核"}</p>
    </div>
    <p><a href="${postUrl}" class="link">查看评论</a></p>
    <p><a href="${siteInfo.url}/admin/comments" class="link">前往后台审核</a></p>
  `;

  return await sendMail({
    to: config.adminEmail,
    subject,
    html: createEmailTemplate(`${typeLabel}通知`, content),
  });
}

// 5. 友链修改请求通知 - 通知站长
export async function notifyFriendLinkModification(
  originalLink: { name: string; link: string },
  newLink: { name: string; link: string; desc?: string | null; avatar?: string | null },
): Promise<boolean> {
  const config = await getMailConfig();

  // 检查是否启用邮件通知
  if (config.pushType === "none" || !config.adminEmail) {
    writeLog("warn", "邮件推送未启用，跳过友链修改通知", { originalLink, newLink });
    return false;
  }

  const siteInfo = await getSiteInfo();
  const subject = `[${siteInfo.name}] 友链修改请求：${originalLink.name}`;

  const content = `
    <h2>友链修改请求通知</h2>
    <p>有人在 <strong>${siteInfo.name}</strong> 提交了友链修改请求：</p>

    <div class="info-box">
      <p><strong>原友链信息：</strong></p>
      <p>名称：${originalLink.name}</p>
      <p>链接：<a href="${originalLink.link}" target="_blank">${originalLink.link}</a></p>
    </div>

    <div class="info-box">
      <p><strong>新友链信息：</strong></p>
      <p>名称：${newLink.name}</p>
      <p>链接：<a href="${newLink.link}" target="_blank">${newLink.link}</a></p>
      ${newLink.desc ? `<p>描述：${newLink.desc}</p>` : ""}
      ${newLink.avatar ? `<p>头像：<a href="${newLink.avatar}" target="_blank">${newLink.avatar}</a></p>` : ""}
    </div>

    <p>请前往后台审核此修改请求。批准后将更新原友链，拒绝后将删除此请求。</p>
    <p><a href="${siteInfo.url}/admin/links" class="link">前往后台管理</a></p>
  `;

  return await sendMail({
    to: config.adminEmail,
    subject,
    html: createEmailTemplate("友链修改请求通知", content),
  });
}
