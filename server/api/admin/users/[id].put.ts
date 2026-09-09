import type { Prisma } from "@prisma/client";

import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateUserData } from "#server/utils/validation";
import { validateCsrfToken } from "#server/utils/csrf";
import { invalidateContentCaches } from "#server/utils/content-cache";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少用户 ID",
    });
  }
  const uid = Number(id);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的用户 ID",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { csrfToken, ...updateBody } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // IDOR 防御：会话用户只能操作自己的账户（否则任意登录用户可重置他人密码/篡改邮箱）
  if (user.uid !== uid) {
    throw createError({
      statusCode: 403,
      message: "无权操作该账户",
    });
  }

  const { name, nickname, mail, password, avatar } = updateBody;

  // 类型 + 空值校验：非字符串（如 name:123）会让 validateUserData 的 .length 绕过、写库抛错→500
  if (typeof name !== 'string' || !name.trim() || typeof mail !== 'string' || !mail.trim()) {
    throw createError({
      statusCode: 400,
      message: "用户名和邮箱不能为空",
    });
  }
  if (nickname !== undefined && nickname !== null && typeof nickname !== 'string') {
    throw createError({ statusCode: 400, message: "昵称格式错误" });
  }
  if (avatar !== undefined && avatar !== null && typeof avatar !== 'string') {
    throw createError({ statusCode: 400, message: "头像格式错误" });
  }
  if (password !== undefined && password !== null && typeof password !== 'string') {
    throw createError({ statusCode: 400, message: "密码格式错误" });
  }

  // 验证字段长度
  validateUserData({ name, mail, nickname, avatar });

  try {
    // 检查用户是否存在
    const existingUser = await prisma.users.findUnique({
      where: { uid },
    });

    if (!existingUser) {
      throw createError({
        statusCode: 404,
        message: "用户不存在",
      });
    }

    // 检查邮箱是否被其他用户占用
    const mailUser = await prisma.users.findUnique({
      where: { mail },
    });

    if (mailUser && mailUser.uid !== uid) {
      throw createError({
        statusCode: 400,
        message: "邮箱已被其他用户使用",
      });
    }

    // 检查用户名是否被其他用户占用
    const nameUser = await prisma.users.findUnique({
      where: { name },
    });

    if (nameUser && nameUser.uid !== uid) {
      throw createError({
        statusCode: 400,
        message: "用户名已被其他用户使用",
      });
    }

    // 构建更新数据
    const updateData: Prisma.usersUpdateInput = {
      name,
      nickname: typeof nickname === 'string' ? nickname : null,
      mail,
      avatar: typeof avatar === 'string' ? avatar : null,
    };

    // 如果提供了新密码，则更新密码
    if (password && password.trim() !== "") {
      if (password.length < 6) {
        throw createError({
          statusCode: 400,
          message: "密码长度不能少于 6 位",
        });
      }
      const { default: bcrypt } = await import("bcryptjs");
      updateData.password = await bcrypt.hash(password, 10);
    }

    // 更新用户
    const updatedUser = await prisma.users.update({
      where: { uid },
      data: updateData,
      select: {
        uid: true,
        name: true,
        nickname: true,
        mail: true,
        avatar: true,
        create_time: true,
      },
    });

    // 修改昵称/头像 → 影响文章详情 /content/** 的作者展示（作者信息/评论表单），失效该模块缓存
    void invalidateContentCaches({ routes: ["/content/**"] }).catch(err => console.error("[cache] 用户资料失效缓存失败", err));

    return {
      success: true,
      data: updatedUser,
    };
  } catch (error) {
    // 预期 400/403/404 原样抛，不打印完整堆栈
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    // findUnique 预检与 update 间并发删除竞态 → P2025 → 404
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "用户不存在" });
    }
    // 并发抢注时 name/mail 唯一约束冲突（P2002）→ 400 而非 500（与 tags/[id].put 处理一致）
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw createError({ statusCode: 400, message: "用户名或邮箱已被使用" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新用户失败",
    });
  }
});
