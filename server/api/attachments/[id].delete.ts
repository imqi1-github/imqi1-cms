import * as fs from "fs";
import * as path from "path";

import { createError, getQuery, getRouterParam } from "h3";

import { getUser } from "#server/lib/auth";
import { deleteFromCOS } from "#server/utils/cos";
import { validateCsrfToken } from "#server/utils/csrf";
import prisma from "#server/utils/prisma";

const getLocalUploadPath = (url: string) => {
  const cleanUrl = url.trim().split("#")[0]?.split("?")[0] ?? url.trim();
  let pathname = cleanUrl;

  try {
    pathname = new URL(cleanUrl).pathname;
  } catch {
    // 本地相对路径直接使用
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // 解码失败时继续使用原路径
  }

  const normalized = pathname.replace(/\\/g, "/");
  if (!normalized.startsWith("/uploads/")) return null;
  if (normalized.split("/").some(segment => segment === "..")) return null;

  return path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
};

export default defineEventHandler(async event => {
  try {
    const user = await getUser(event);
    if (!user) {
      throw createError({
        statusCode: 401,
        message: "未登录",
      });
    }

    const id = Number(getRouterParam(event, "id"));

    if (!id) {
      throw createError({
        statusCode: 400,
        message: "无效的附件 ID",
      });
    }

    // CSRF 验证 - 从查询参数获取
    const csrfToken = getQuery(event).csrfToken as string;
    if (!validateCsrfToken(event, csrfToken)) {
      throw createError({
        statusCode: 403,
        message: "CSRF token 验证失败，请刷新页面重试",
      });
    }

    // 获取附件信息
    const attachment = await prisma.attachments.findUnique({
      where: { aid: id },
      include: {
        posts: {
          select: {
            uid: true,
          },
        },
      },
    });

    if (!attachment) {
      throw createError({
        statusCode: 404,
        message: "附件不存在",
      });
    }

    // 验证附件所有权：只有文章作者才能删除附件
    if (attachment.posts.uid !== user.uid) {
      throw createError({
        statusCode: 403,
        message: "无权删除此附件",
      });
    }

    // 根据存储位置删除文件
    if (attachment.storage === "cos") {
      // 删除腾讯云COS文件
      const result = await deleteFromCOS(attachment.url);
      if (!result.success) {
        console.error(result.error);
      }
    } else {
      // 删除本地 /uploads 文件
      const filePath = getLocalUploadPath(attachment.url);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(err);
        }
      }
    }

    // 删除数据库记录
    await prisma.attachments.delete({
      where: { aid: id },
    });

    return {
      success: true,
      message: "删除成功",
    };
  } catch (error) {
    console.error(error);

    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "删除失败";

    throw createError({
      statusCode: 500,
      message,
    });
  }
});
