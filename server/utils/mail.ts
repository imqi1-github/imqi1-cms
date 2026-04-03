import nodemailer from 'nodemailer'
import prisma from '#server/utils/prisma'
import * as fs from 'fs'
import * as path from 'path'

// 邮件日志目录
const LOG_DIR = path.join(process.cwd(), 'logs', 'mail')

// 确保日志目录存在
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

// 获取日志文件路径
function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0]
  return path.join(LOG_DIR, `${date}.log`)
}

// 写入日志
function writeLog(level: string, message: string, data?: any) {
  ensureLogDir()
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  }
  const logLine = JSON.stringify(logEntry) + '\n'
  fs.appendFileSync(getLogFilePath(), logLine, 'utf-8')
}

// 获取邮件配置
async function getMailConfig() {
  const settings = await prisma.meta.findMany({
    where: {
      key: {
        in: [
          'emailLogEnabled',
          'emailPushType',
          'smtpHost',
          'smtpPort',
          'smtpSecureMode',
          'smtpUser',
          'smtpPassword',
          'smtpFromName',
          'smtpAddress',
          'adminEmail',
          'notifyAdmin',
        ],
      },
    },
  })

  const get = (key: string) => settings.find(s => s.key === key)?.value || ''

  return {
    logEnabled: get('emailLogEnabled') === 'true',
    pushType: get('emailPushType') || 'none',
    host: get('smtpHost'),
    port: parseInt(get('smtpPort')) || 465,
    secureMode: get('smtpSecureMode') || 'tls',
    user: get('smtpUser'),
    password: get('smtpPassword'),
    fromName: get('smtpFromName') || 'Blog',
    address: get('smtpAddress') || get('smtpUser'),
    adminEmail: get('adminEmail'),
    notifyAdmin: get('notifyAdmin') === 'true',
  }
}

// 创建邮件传输器
async function createTransporter() {
  const config = await getMailConfig()

  if (config.pushType === 'none' || !config.host) {
    return null
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secureMode === 'ssl',
    auth: {
      user: config.user,
      pass: config.password,
    },
  })
}

// 邮件接口
export interface MailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

// 发送邮件
export async function sendMail(options: MailOptions): Promise<boolean> {
  const config = await getMailConfig()

  // 记录日志
  if (config.logEnabled) {
    writeLog('info', '准备发送邮件', {
      to: options.to,
      subject: options.subject,
    })
  }

  // 如果推送类型是 none，只记录日志
  if (config.pushType === 'none') {
    if (config.logEnabled) {
      writeLog('warn', '邮件推送未启用，跳过发送', {
        to: options.to,
        subject: options.subject,
      })
    }
    return true
  }

  try {
    const transporter = await createTransporter()

    if (!transporter) {
      throw new Error('无法创建邮件传输器，请检查 SMTP 配置')
    }

    const from = config.address
      ? `"${config.fromName}" <${config.address}>`
      : config.user

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    })

    if (config.logEnabled) {
      writeLog('info', '邮件发送成功', {
        to: options.to,
        subject: options.subject,
      })
    }

    return true
  } catch (error) {
    if (config.logEnabled) {
      writeLog('error', '邮件发送失败', {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return false
  }
}

// 发送测试邮件
export async function sendTestEmail(to: string): Promise<{ success: boolean; message: string }> {
  const config = await getMailConfig()

  if (config.pushType === 'none') {
    return { success: false, message: '邮件推送未启用' }
  }

  if (!config.host) {
    return { success: false, message: 'SMTP 配置不完整' }
  }

  try {
    const transporter = await createTransporter()

    if (!transporter) {
      return { success: false, message: '无法创建邮件传输器' }
    }

    const from = config.address
      ? `"${config.fromName}" <${config.address}>`
      : config.user

    await transporter.sendMail({
      from,
      to,
      subject: '测试邮件',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">测试邮件</h2>
          <p>这是一封测试邮件，如果您收到此邮件，说明您的 SMTP 配置正确！</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            发送时间: ${new Date().toLocaleString('zh-CN')}
          </p>
        </div>
      `,
    })

    writeLog('info', '测试邮件发送成功', { to })
    return { success: true, message: '测试邮件发送成功' }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    writeLog('error', '测试邮件发送失败', { to, error: errorMsg })
    return { success: false, message: `发送失败: ${errorMsg}` }
  }
}

// 发送新评论通知
export async function sendCommentNotification(
  comment: any,
  postTitle: string
): Promise<boolean> {
  const config = await getMailConfig()

  // 检查是否需要通知管理员
  if (!config.notifyAdmin || !config.adminEmail) {
    return false
  }

  if (config.pushType === 'none') {
    writeLog('warn', '邮件推送未启用，跳过评论通知', {
      commentId: comment.coid,
    })
    return false
  }

  const commentUrl = `${process.env.SITE_URL || 'http://localhost'}/post/${comment.cid}`

  return await sendMail({
    to: config.adminEmail,
    subject: `新评论提醒：${comment.name} 评论了您的文章`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">新评论通知</h2>
        <p>您的文章 <strong>${postTitle}</strong> 收到了一条新评论：</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p style="margin: 0 0 10px 0;"><strong>${comment.name}</strong> 说：</p>
          <p style="margin: 0; color: #666;">${comment.content}</p>
        </div>
        <p style="color: #999; font-size: 12px;">
          邮箱: ${comment.mail || '未填写'}<br>
          IP: ${comment.ip || '未知'}
        </p>
        <p style="margin-top: 20px;">
          <a href="${commentUrl}" style="display: inline-block; padding: 10px 20px; background: #0070f3; color: white; text-decoration: none; border-radius: 5px;">
            查看评论
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          发送时间: ${new Date().toLocaleString('zh-CN')}
        </p>
      </div>
    `,
  })
}

// 获取最近的邮件日志
export function getRecentLogs(limit = 50): Array<{
  timestamp: string
  level: string
  message: string
  [key: string]: any
}> {
  ensureLogDir()

  const today = new Date().toISOString().split('T')[0]
  const logPath = path.join(LOG_DIR, `${today}.log`)

  if (!fs.existsSync(logPath)) {
    return []
  }

  const content = fs.readFileSync(logPath, 'utf-8')
  const lines = content.trim().split('\n')

  const logs: any[] = []
  for (const line of lines.reverse()) {
    try {
      logs.push(JSON.parse(line))
      if (logs.length >= limit) break
    } catch {
      // 忽略无法解析的行
    }
  }

  return logs
}
